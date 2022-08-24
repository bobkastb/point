#!/usr/bin/python
# -*- coding: UTF-8 -*-

import sys

def KramerRead(f):
    res=""
    while 1>0:
        v=f.read(1)
        #print("read char<<"+ str(ord(v))+" "+v )
        if ( ord(v) == 10 ):
            break
        res=res+v
    #f.read(1)  
    # 2 раза 0A
    return res
        
def KramerCmd(f, cmd ):
    fcmd = "#"+cmd;
    f.write(fcmd+"\r")
    rd = KramerRead(f)
    print( ">> {0} << {1}".format(  fcmd ,  rd ))
    return rd
    
port = sys.argv[1]
print ("--- test srial port --- ",port)

#if __name__ == "__main__":
#    for param in sys.argv:
#        print (param)
f= open(port,"r+") 
KramerCmd(f,"MODEL?")
KramerCmd(f,"VERSION?")
KramerCmd(f,"PROT-VER?")
KramerCmd(f,"SN?")
KramerCmd(f,"BUILD-DATE?")
print("end")



