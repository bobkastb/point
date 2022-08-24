#!/usr/bin/python
# -*- coding: UTF-8 -*-

import sys
from time import sleep
from datetime import datetime


ctx_timestart=datetime.now();
ctx_timecurrent=ctx_timestart;

def StrToHex( ss ):
    return "".join("\\x{:02x}".format(ord(c)) for c in ss )
    
def CamRead(f):
    res=""
    while 1>0:
        v=f.read(1)
        res=res+v
        if ( v=='\xFF'):
            break
    return res
        
def CamCmd(f, cmd , desc="" ):
    fcmd = "\x81"+cmd+"\xFF";
    f.write(fcmd)
    rd = CamRead(f)
    print( "{0} >> {1} << {2}".format(  desc , StrToHex(fcmd) ,  StrToHex(rd) ))
    return rd
    
port = "/dev/ttyS5"    
if len(sys.argv)>1:
    port = sys.argv[1]
print ("--- test srial port --- ",port)

#if __name__ == "__main__":
#    for param in sys.argv:
#        print (param)
f= open(port,"r+b") 
CamCmd(f,"\x09\x04\x22", "Get ID:")
CamCmd(f,"\x09\x00\x02", "Get Version:")
CamCmd(f,"\x09\x04\x47", "Get Zoom pos:")

ctx_timestart=datetime.now()
desclastE=""
errcnt=0
ctx_timelasterr=0;
while (1>0):
    sleep(2)
    ct = (datetime.now() - ctx_timestart).seconds;
    try:
        CamCmd(f,"\x09\x04\x47" , "t {0} (per={1} err={2}) :".format(ct,desclastE,errcnt))
    except:
        f.close();
        f= open(port,"r+b") 
        errcnt=errcnt+1
        desclastE= ct - ctx_timelasterr
        ctx_timelasterr= ct
        print "{0} Error and reopen per={1}".format(ct,desclastE)

print("end")



