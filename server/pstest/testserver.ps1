
if (!$Scripdir) { $Scripdir=[IO.Path]::GetFullPath($($MyInvocation.MyCommand.Definition | split-path -parent)); };

$ucfg = . "$Scripdir\ctest1.ps1"
$ErrorActionPreference="Stop"
$IgnoreError = "IgnoreError"
$global:ctx = @{
	wc = $null; 
	errslist=@();
	lresult=@{}
	lresponse="";
	outretonerr=$true;
	resp_servertime=0
}

function init_wc($ctx){
	$ctx.wc= new-object net.webclient;
	$ctx.wc.Encoding=[text.encoding]::utf8;
}
init_wc $ctx;


function global:ConvertTo-Json20([object] $item){
    add-type -assembly system.web.extensions
    $ps_js=new-object system.web.script.serialization.javascriptSerializer
	$ps_js.MaxJsonLength=16*1024*1024;
    return $ps_js.Serialize($item)
}

function global:ConvertFrom-JsonXX([object] $item){ 
    add-type -assembly system.web.extensions
    $ps_js=new-object system.web.script.serialization.javascriptSerializer
	$ps_js.DeserializeObject($item);
}

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
    add-type -assembly system.web.extensions
    $ps_js=new-object system.web.script.serialization.javascriptSerializer
	$m=$ps_js.DeserializeObject($item);
	$jtype= $ps_js.DeserializeObject('{"r":5}').gettype();
	#write-host "type = $jtype"
    return ,(js20_ht $m);
}

function docommand_c( $url , $params , $throwerr=$true ){
	$c = "$($ucfg.hosturl)$url";
	
	if ($params) { $c+='?'+ (($params.keys | %{ $_+'='+$params.$_} )-join '&');}
	write-host "hget: $c"

	$ctx.lresponse = $jstr=$ctx.wc.downloadstring( $c );
	$ctx.lresult=$r=ConvertFrom-Json20 $jstr
	$ctx.resp_servertime = $r.servertime
	if ($r.error ) { 
		#if ($ctx.outretonerr) { write-host $jstr }
		if ($throwerr -eq $IgnoreError ) {
			write-host "	",$r.error ; # -ForegroundColor  red; 		#write-error  $r.error; 
		} else {
			$ctx.errslist += @{ url=$url; error=$r.error } 
			if ($throwerr) { throw $r.error; }
		}	
	}
	$r;
}
function docommand_j( $url , $params , $throwerr=$true ){
	$p = @{ value=ConvertTo-Json20 $params; }
	docommand_c $url $p  $throwerr
}
function docommand_l( $url , $idl=$null , $throwerr=$true ){
	if ( $idl )	 {
		docommand_c $url @{ ids=$idl -join ',' }  $throwerr 
	} else {
		docommand_c $url 0 $throwerr
	} 
}
function docommand( $url , $throwerr=$true ){	docommand_c $url 0 $throwerr }
function getfile( $url ){
	$jstr=$ctx.wc.downloadstring( "$($ucfg.hosturl)$url" );
}

#---------------------------------------------------------------------
function test1(){
	$jstr=$ctx.wc.downloadstring( "$($ucfg.hosturl)/cmd/config" );
	$x=ConvertFrom-Json20 $jstr
	$x;
	$x.result
}


function cmp_slev( $l , $r ){
	$l.keys | where {$l.$_ -ne $r.$_};
}

function test_Switch(){}
function test_Capture(){}
function test_Camera(){}
function testinterval( $v , $a ){ return (($v -ge $a[0]) -and ($v -gt $a[1])) }
function testthrow( $c , $t) { 	if ($c) { throw $t } }
function test_Scheduler(){
	
	function linetest($cfgScheduler){
	$sc = docommand "/cmd/schedule/state"  $true;
    $c1 = "PeriodResolution","Enabled" | where {$cfgScheduler.$_ -ne $sc.result.SchedulerState.cfg.$_}; 
	if ($c1) { throw "Not match field config.Scheduler & SchedulerState.cfg : $c1 " }
	
	$s_emp=$sc.result.SchedulerState.tasks; 
	foreach ( $tc in $sc.result.Scheduler.Entries) {}
	$cfgScheduler.Entries | %{ $tc=$_;$t=$s_emp[$tc.Id]; if ( $t.next_duration -ne $_.Duration ) {throw "Invalid duration in "+$tc.Id}	
		$bf = cmp_slev $tc $t.entry 
		if ($bf) { throw "Bad fields match [$bf] for task ID $($tc.Id)" }	
	}

	# Update test!
	$e = $cfgScheduler.Entries[0]; $cc=@{ Scheduler=@{Entries=@(@{Id=$e.Id;Duration=$e.Duration+1; Period=$e.Period+1 })} }
	$null = docommand_l '/cmd/schedule/stop' $e.Id $IgnoreError
	$sc = docommand_j '/cmd/schedule/update' $cc
	$cc.Scheduler.Entries[0]= @{ Id=$e.Id; Duration=$e.Duration; Period=$e.Period };	
	$null = docommand_j '/cmd/schedule/update' $cc 
	$n_ts=$sc.result.SchedulerState.tasks[$e.Id]; $n_se = $n_ts.entry; $o_ts=$s_emp[$e.Id];
	#$n_se | out-host
	testthrow  ($n_se.Duration -ne ($e.Duration+1))  "Fail Test update 'duration'!"
	testthrow ($n_se.Period -ne ($e.Period+1)) 		 "Fail Test update 'period'!" 
	if (($o_ts.next_duration -eq $n_ts.next_duration) -or ($o_ts.next_starttime -eq $n_ts.next_starttime) )	{
		#$o_ts.entry , $n_ts.entry | out-host
		throw "Fail Test update 'next_duration' & 'next_starttime' !" } 
	
	#New/delete test
	$newte=@{Allowed=$true; Id="testID"; Start= 1110; Duration= 40; Period= 3000; Name="test PS name"; Camera="2"; FileTemplate="PSTestId1";  }
	$sc = (docommand_j '/cmd/schedule/update' @{ Scheduler=@{Entries=@($newte)}} ).result.SchedulerState; 
	$t =$sc.tasks[$newte.Id]
	testthrow (!$t) "Task dont create! $($newte.Id)" 
	$er = ($newte.keys | where { $t.entry.$_ -ne $newte.$_}) -join ","; 
	testthrow $er "Error In new task- bad fields: $er" 
	
	$sc = (docommand_l '/cmd/schedule/delete' $newte.Id).result.SchedulerState;
	testthrow ($sc.tasks[$newte.Id]) "Task dont deleted $($newte.Id)" 
	testthrow (!(docommand_l '/cmd/schedule/delete' $newte.Id $IgnoreError).error)  "Invalid reaction for delete non exists task"


	# RUN test!
	$e = $cfgScheduler.Entries[0];
	$sc= (docommand '/cmd/schedule/stop').result.SchedulerState; 
	if ($sc.isExecute -or $sc.cfg.Enabled) { throw "Invalid data after stop scheduler" }	
	if ( $sc.tasks.values | where {$_.state -ne "notrun"} ) { throw "Not all task stopped after stop scheduler" } 
	#$sc= docommand '/cmd/schedule/stop' $IgnoreError; if (!$sc.error) {throw "ivalid reaction for repeat stop!"}

	$resp= docommand_l '/cmd/schedule/start' $e.Id; $x=$resp.result.SchedulerState.tasks[$e.Id]; 
	if ($x.state -ne "Running")	{throw "Task $($e.Id) not running"}
	#$ctx.lresponse | out-host; $resp , $x | out-host
	if ( testinterval ($x.last_starttime - $resp.servertime) (0,2) ) {throw "Invalid last_starttime after running"}

	$resp= docommand_l '/cmd/schedule/start' $e.Id $IgnoreError; if (!$resp.error) {throw "ivalid reaction for repeat start!"}
	$sc= (docommand_l '/cmd/schedule/stop' $e.Id).result.SchedulerState; $x=$sc.tasks[$e.Id]; 
	if ($x.state -ne "notrun")	{ throw {"Task $($e.Id) not stopped"} }
	if (!$(docommand_l '/cmd/schedule/stop' $e.Id $IgnoreError).error) {throw "ivalid reaction for repeat stop!"}

	$sc= docommand_l '/cmd/schedule/start' $e.Id; 
	$sc= (docommand '/cmd/schedule/stop').result.SchedulerState; 
	$sc.tasks.values | where {$_.state -ne "notrun"} | out-host
	if ( $sc.tasks.values | where {$_.state -ne "notrun"} ) {throw "Not all task stopped after stop scheduler" }
	}# linetest

	#***********************
	$alcfg = docommand "/cmd/config";
	$cfgScheduler= $alcfg.result.Scheduler
	$o_response = ConvertFrom-JsonXX $ctx.lresponse
	
	#$o_response.result.Scheduler | out-host
	#ConvertTo-Json20 @{ Scheduler=$o_response.result.Scheduler } | out-host; return 
	#ConvertTo-Json20 $o_response.result.Scheduler | out-host; return;
	
	if (1){
	try {
		linetest $cfgScheduler
	} catch {
		write-host "Scheduler test FAIL!",$_ -ForegroundColor red -BackgroundColor black
	}
	write-host "restore settings"
	}
	#$o_response.result.Scheduler.PeriodResolution = 2; 	$sc = docommand_j "/cmd/schedule/set"  @{ Scheduler=$o_response.result.Scheduler };	$o_response.result.Scheduler.PeriodResolution = 1; 
	$sc = docommand_j "/cmd/schedule/set"  @{ Scheduler=$o_response.result.Scheduler };
	
}
$ucfg | out-host

#ConvertTo-Json20 @{ Scheduler=@{Entries=@(@{Id="ID1";Duration=55})} }
$null = test_Scheduler;

#try {} catch {		write-error "error...terminated!" };


