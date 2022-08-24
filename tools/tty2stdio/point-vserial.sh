#!/bin/bash


#trap "echo ' Trapped Ctrl-C'" SIGINT
trap "onexit" EXIT

MyPID=$$
function kill_recurse() {
    cpids=`pgrep -P $1|xargs`
    for cpid in $cpids;
    do
        kill_recurse $cpid
    done
    echo "killing $1"
    kill $1
}


function onexit(){
    echo ' On exit!'
    kill_recurse $MyPID
}


./tty2stdio /opt/stelcs/virtualCOM/links/redir1 switch.server.js &
./tty2stdio /opt/stelcs/virtualCOM/links/redir2 camera.VCB30U.js &
wait $!

exit 0
