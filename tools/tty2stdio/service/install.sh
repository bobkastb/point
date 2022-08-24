#!/bin/bash

MyDir=$(realpath $(dirname "${BASH_SOURCE[0]}"))
DesktopPath=$(xdg-user-dir DESKTOP)
export PO_HOME=$(realpath "$MyDir/..")
export PO_USER="$USER"
C_USER="$USER"
export InstallTime=$(date)
MySystemDir="$MyDir/system"
#echo "MyDir=$MyDir"; exit 0;

function echoerr() { echo "$@" 1>&2; }
function firstWich(){
	for var in "$@"; do
		which $var > /dev/null; 
		#echo "-which $var > /dev/null  == $?"
		if [[ $? == 0 ]]; then echo $var;return; fi  
	done 
}
xTerminal=$(firstWich gnome-terminal fly-term xterm)
export ExecCommandLine="$PO_HOME/run_all.sh"
if [[ $xTerminal ]]; then 
	export ExecCommandLine="$xTerminal -e $PO_HOME/run_all.sh"
fi
#export ExecCommandLine

if [[ ! $USER ]]; then  
	echoerr "Это нельзя запускать так. Требуется переменная окружения USER"; 
	exit 1
fi

#gnome-terminal -e , xterm -e 

if [[  $SUDO_USER != ""  && $SUDO_USER != $USER ]]; then 
echo "Хтото запустил это из под судо... Поправим положение "
	C_USER=$SUDO_USER
	oldHome="$HOME"
	export HOME=$(eval "echo ~$SUDO_USER");
	DesktopPath=$(xdg-user-dir DESKTOP)
	export PO_USER="$SUDO_USER"
	export HOME="$oldHome"
fi

#**********************************

function InstallSystemService(){
	local srcfile="$1"
	local basefn=$(basename $srcfile)
	local dstlink="/etc/systemd/system/$basefn"
	local dstfile="$MySystemDir/$basefn"
	mkdir -p "$MySystemDir"
	#tmpfile="/tmp/POINT-install-tmp.txt"
	echo "Make system file $srcfile >> $dstfile  "
	envsubst < $srcfile > $dstfile
	local oldlink=$(readlink $dstlink) 
	if [[ $oldlink != $dstfile ]]; then
		echo "Update system link:: $dstlink "	
		sudo ln -fs $dstfile $dstlink
		sudo systemctl enable $basefn
	fi	
	#ln -fs ~/point-tasks/PO-Int/install/system/PO-Int.log.conf /etc/rsyslog.d/PO-Int.log.conf
	#sudo systemctl restart rsyslog
	countServices=$(( countServices + 1 ))
}	

function InstallLogrotate(){
	local srcfile="$1"
	local basefn=$(basename $srcfile)
	local dstfile="/etc/logrotate.d/$basefn"
	echo "Make logrotate file $dstfile"
	sudo cp "$srcfile" "$dstfile"
	change_logrotate=$(( change_logrotate + 1 ))
}

function InstallJournal(){
	local srcfile="$1"
	local basefn=$(basename $srcfile)
	local dstfile="$MySystemDir/$basefn"
	mkdir -p "$MySystemDir"
	cp "$srcfile" "$dstfile"
	echo "Make rsyslog include file $dstfile"
	sudo ln -fs $dstfile /etc/rsyslog.d/$basefn
	# /etc/logrotate.d
	#cp ~/point-tasks/PO-Int/install/point.logrotate /etc/logrotate.d/
	change_rsyslog=$(( change_rsyslog + 1 ))
}

function InstallDesktopfile(){
	local srcfile="$1"
	local basefn=$(basename $srcfile)
	local dstfile="$DesktopPath/$basefn"
	echo "Make Desktop file $srcfile >> $dstfile  "
	#return
	envsubst < "$srcfile" >"$dstfile"
	chmod 777 "$dstfile"
	chown $C_USER:$C_USER "$dstfile"
}


function forfiles(){ #mask , #cmd
	#echo "попытка $2..."
	dlist=$(ls $MyDir/$1 2>/dev/null)
	for i in ${dlist[@]}; do 
		$2 $i; 
	done
}

function addToGroup(){
	local user=$1; local group=$2;
	if id -nG "$user" | grep -qw "$group"; then return 0; fi
	sudo addgroup $user group
}

echo "1.Добавление текущего пользователя ($USER, $C_USER) в группу dialout, для доступа к COM портам"
addToGroup $USER dialout
if [[  $C_USER != $USER ]]; then 
	addToGroup $C_USER dialout
fi	

echo "2.Добавление ярлыков на рабочий стол " #(cmd: $ExecCommandLine )"
forfiles '*.desktop' InstallDesktopfile 

echo "3.Установка сервисов"
forfiles '*.service' InstallSystemService

echo "4.Настройка журналирования"
forfiles '*.log.conf' InstallJournal
forfiles '*.logrotate' InstallLogrotate


if (( countServices )); then 
	echo "systemctl daemon-reload"
	sudo systemctl daemon-reload; 
fi
if (( change_rsyslog )); then  
	echo "restart rsyslog service"
	sudo systemctl restart rsyslog; 
fi

