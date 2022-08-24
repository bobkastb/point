
$global:BaseDirectory = [IO.Path]::GetFullPath($($MyInvocation.MyCommand.Definition | split-path -parent)+"\..");	

$global:cfg=@{
	server="192.168.77.40"
	verbose=$true
	camid="C1"
	remotepath="/home/user/img"
	selfimagepath="\\192.168.77.40\c$\home\user\img"
	lastfile=""
	stepzoom=9*12
	ZoomMinStep=12
	ZoomMinValue=12
	Zoom_Maxvalue=16384
}
#. ".\enter-session.ps1"
add-type -assembly system.web.extensions
$global:ps_js=new-object system.web.script.serialization.javascriptSerializer
function global:ConvertFrom-Json20([object] $item){ 
	function js20_ht($m) {
		if ($m -is $jtype) { 
            $r=@{}; $m.keys | where {$_} | %{ $r[$_]=js20_ht $m.$_;};
             #$r | out-host;
             return $r; 
		}elseif ($m -is [object[]]) { 
            $m | %{ js20_ht $_ }; 
		}else { $m };
	};
	$m=$ps_js.DeserializeObject($item);
	$jtype= $ps_js.DeserializeObject('{"r":5}').gettype();
	#write-host "type = $jtype"
    return ,(js20_ht $m);
}
function global:ConvertTo-Json20([object] $item){
	$ps_js.MaxJsonLength=16*1024*1024;
    return $ps_js.Serialize($item)
}


function printresult($r) {	write-host (($r.keys | %{ "$_=$($r.$_)" }) -join ',') }

function makewc(){ $wc= new-object net.webclient; $wc.Encoding=[text.encoding]::utf8; return $wc}

function wsget($url) {
	$wc= makewc; 
	if ($cfg.verbose) { write-host $cmd;}
	$wc.downloadstring($url)
}

function lcmd( $cmd ){ wsget "http://localhost:8126/$cmd" }
function s_cmd( $cmd ){ wsget "http://$($cfg.server):8126/$cmd"; }

function scmd( $cmd ){ $t=wsget "http://$($cfg.server):8126/$cmd"; 
	$r=ConvertFrom-Json20 $t; 
	if ($r.error) { write-host $r.error -f red }
	if ($r.result -and $cfg.verbose) { printresult $r.result; }	
	$r.result
}
function mscmd( $cmd ){ wsget "http://$($cfg.server):8080/$cmd" } 
function cmd39( $cmd ) { wsget "http://192.168.77.39/test.cgx?cmd=$cmd" }

function help(){
write-host "Enter PO-Int Session! ... try sample: scmd 'cmd/switch/state' , 
	Command:	
	scmd '...'		:
	makezoom_shots 	: Последовательная серия снимков в каталог $($cfg.selfimagepath) 
	. '.\enter-session.ps1' : Перезагрузка этого модуля
	zoom <0..16834>	
	focus <0..2000>
	focusauto <0|1>
	doSnapShot <part_filename> : Snapshot to $($cfg.remotepath)/shots
"
}
function nowtimestr() { [datetime]::Now.toString('yyMMdHHmmss') }

#---------------------------
function doSnapShot( $v=$(nowtimestr) ){
		$filename=$cfg.remotepath+"/shots/ss_$v.jpg"
		$cfg.lastfile= $cfg.selfimagepath+"/shots/ss_$v.jpg"
		mscmd "capture/snapshot?file=$filename"
		write-host $cfg.lastfile
		. $cfg.lastfile
}


function setcamdata($d){
	$l="";$sep='';
	foreach ($k in $d.keys) {
		$l+='{0}"{1}":{2}' -f $sep,$k,$d.$k
		$sep=',';
	}
	$l='{'+$l+'}'
	$cmd='cmd/cam/setdata?id={0}&value={1}' -f $cfg.camid,$l 
	
	scmd $cmd
}
function getcamdata( $lst ) {
	scmd ('cmd/cam/getdata?id={0}&value={1}' -f $cfg.camid,($lst -join ',') )
}
function setzoom($v) { setcamdata @{ ZoomPos=$v;FocusAuto=1  }}
function getzoom() { getcamdata ZoomPos,FocusPos }

function focusauto($v=1) { 
	 setcamdata @{ FocusAuto=if ($v) {1} else {0} }; 
	}
function zoom($d) { 
	if ($d -is [int]) {
		$null=setcamdata @{ ZoomPos=$d;  }
	}		
	getcamdata FocusPos,ZoomPos
}

function focus($d){
	if ($d -is [int]) {
		$null=setcamdata @{ FocusAuto=0; FocusPos=$d  }
	}	
	getcamdata FocusPos,ZoomPos
}

function waitAutoFocus(){
		$r=zoom; $prev=@{}
		while ($r.FocusPos -ne $prev.FocusPos ) { 
			if (!$cfg.verbose) { printresult $r;}
			sleep 1
			$prev= $r
			$r=zoom;
		}	
		$r;
}

function doSnapShotStep( $ctx, $zoomdata ){
		$null= setzoom $zoomdata
		sleep 2
		$r = waitAutoFocus
		$filename=$ctx.remotepath+"/zoom/ZoomImg_$($r.ZoomPos)_$($r.FocusPos).jpg"
		$null=focusauto 0
		$r= focus
		write-host "snapshot $filename" -f green
		mscmd "capture/snapshot?file=$filename"
}

function makezoom_shots(){
	remove-item "$($cfg.selfimagepath)\zoom\*" -Confirm
	$null=setzoom 0
	$null=waitAutoFocus
	$step=$cfg.stepzoom 
	for ($i=$cfg.ZoomMinValue;$i -lt $cfg.Zoom_Maxvalue;$i+=$step){
		$null=doSnapShotStep $cfg $i
	}
	doSnapShotStep $cfg $cfg.Zoom_Maxvalue
	focusauto 1
}

function schedule_update_e( $e ){ # $e=@{ Id:"", Start: 0, Duration: 0,  Period: 0,  Name:"",   Camera: "", Camera_PresetID:"", FileTemplate:"", Allowed: false }
#schedule_update_e @{Id:"C1";Allowed:$true }
	$r=@{Scheduler=@{Entries=@($e)}}
	$s=ConvertTo-Json20 $r
	scmd "cmd/schedule/update?value=$s"
}

#http://10.1.0.80:8126/cmd/schedule/update?value={"Scheduler":{"Entries":[{"Id":"ID2","Camera_PresetID":"группа"}]}
#scmd "cmd/schedule/update?value={"Scheduler":{"Entries":[{"Id":"ID2","Camera_PresetID":"группа"}]}"

help;
