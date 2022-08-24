#!/bin/bash


#nodejs switch.server.js &
#/wait
#echo "terminate!"

#trap "echo ' Trapped Ctrl-C'" SIGINT
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
trap "onexit" EXIT


./tty2stdio /home/q/serial/redir1 switch.server.js &
./tty2stdio /home/q/serial/redir2 camera.VCB30U.js &
wait $!

exit 0

echo This is a test script
count=1
while [ $count -le 10 ]
do
    echo "Loop #$count"
    sleep 1
    count=$(( $count + 1 ))
done