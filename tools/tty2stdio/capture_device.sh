#!/bin/bash
MyDir=$(realpath $(dirname "${BASH_SOURCE[0]}"))

#FFMPEG=$MyDir/../../bin/ffmpeg
FFMPEG=ffmpeg
#cfgfile=$MyDir/../vdata/capture/from.data
cfgfile=$MyDir/capture_direct.data
currentCaptureDevice=""
devicepath=$MyDir/../vdata
childPid=

function echoerr() { echo "$@" 1>&2; }
function mlog(){ echo "$@" 1>&2; }


function kill_recurse() {
    cpids=`pgrep -P $1|xargs`
    for cpid in $cpids; do
        kill_recurse $cpid
    done
    #mlog "killing $1"
    kill $1
}


function cap_mp4( ){
	local file=$1
	ffmpeg  -i $file -filter_complex loop=-1:1000 -c:v mjpeg -qscale 31 -vsync 1  -tune zerolatency -f mjpeg - | $MyDir/I2O 65  
}
function cap_jpg( ){
	local file=$1
	while [ 1 ] ; do
		cat $file
		inotifywait -t 1 $file &>  /dev/null
	done	
}
function start_capture(){
	if [[ $childPid ]]; then 
		mlog "try kill $childPid"
	 	kill_recurse $childPid > /dev/null
		wait $childPid > /dev/null
	fi	 
	mlog "start_capture $1($2)"
	$1 $2 &
	childPid="$!" 
	mlog "child pid=$childPid"
} 

function callnew(){
	#local newcap=$1
	cdir=$devicepath/$currentCaptureDevice
	if [ -f $cdir/current.jpg ]; then
		start_capture cap_jpg "$cdir/current.jpg"
	elif [ -f $cdir/current.mp4 ]; then
		start_capture cap_mp4 "$cdir/current.mp4"
	else 
		mlog "invalid device path $cdir/current.(jpg|mp4)"
		start_capture cap_jpg "$devicepath/error/current.jpg"
	fi
}

function main(){
	while [ 1 ] ; do
		. $cfgfile
		if [[ "$input" != "$currentCaptureDevice" ]] ; then
			mlog "change capture device ($currentCaptureDevice) =>  $input"
			currentCaptureDevice="$input"
			callnew 
		fi	
		inotifywait $cfgfile &> /dev/null
		#sig=$(inotifywait $cfgfile)
	done
	#if [[ "$currentsignal" ==
}

mlog "start process[$$] scan $cfgfile..."
main

#./capture_device.sh > /dev/null