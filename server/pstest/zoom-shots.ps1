
$cfg=@{
 Camera="C1";
 step=100;
 remotepath="/home/user/img/zoom"
 Zoom_Maxvalue=16384
}

function makewc(){ $wc= new-object net.webclient; $wc.Encoding=[text.encoding]::utf8; return $wc}
function scmd( $cmd ){ 
write-host "scmd -> $cmd"
$wc= makewc; $wc.downloadstring("http://192.168.77.40:8126/$cmd") }
function mscmd( $cmd ){ $wc= makewc; $wc.downloadstring("http://192.168.77.40:8080/$cmd") } 
function cmd39( $cmd ) { $wc= makewc; $wc.downloadstring("http://192.168.77.39/test.cgx?cmd=$cmd"); }



function zoom( $camid, $v ){
	write-host "set zoom = $v" 
	scmd ('cmd/cam/setdata?id={0}&value={{ "ZoomPos":{1} }}' -f  $camid,$v )
	#scmd 'cmd/cam/getdata?id=C1&value=FocusPos'
	# scmd 'cmd/cam/setdata?id=C1&value={"ZoomPos":0}'
}

function doSnapShotStep( $ctx, $zoom ){
		$filename=$ctx.remotepath+"/ZoomImg_$zoom.jpg"
		zoom $ctx.Camera $zoom
		sleep 2	
		mscmd "capture/snapshot?file=$filename"
}

# mscmd "capture/snapshot?file=/home/user/img/zoom/ZoomImg_0.jpg"

function mskezoom_shots(){

	
	zoom $cfg.Camera 0
	sleep 5
	$step=$cfg.step 
	for ($i=0;$i -lt $cfg.Zoom_Maxvalue;$i+=$step){
		doSnapShotStep $cfg $i
	}
	doSnapShotStep $cfg $cfg.Zoom_Maxvalue
			
}

mskezoom_shots