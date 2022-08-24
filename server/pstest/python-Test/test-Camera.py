#!/usr/bin/python
# -*- coding: UTF-8 -*-

import sys

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
        
def CamCmd(f, cmd ):
    fcmd = "\x81"+cmd+"\xFF";
    f.write(fcmd)
    rd = CamRead(f)
    print( ">> {0} << {1}".format(  StrToHex(fcmd) ,  StrToHex(rd) ))
    return rd
def CamCmd2(f, cmd ):
    fcmd = "\x81"+cmd+"\xFF";
    f.write(fcmd)
    rd = CamRead(f)
    rd2 = CamRead(f)
    print( ">> {0} << {1}".format(  StrToHex(fcmd) ,  StrToHex(rd) , StrToHex(rd2) ))
    return rd
def ans_DecodeResolution( ans ):
    invm="Invalid Mode"
    intr=["1080p-60","1080p-50","1080p-29.97","1080p-25",   invm,invm,"720p-60","720p-50", "720p-29.97","720p-25"]
    c= ord(ans[2])
    if c>=len(intr):
        return invm
    return intr[c]
    
port = "/dev/ttyS6"    
if len(sys.argv)>1:
    port = sys.argv[1]
print ("--- test srial port --- ",port)

#if __name__ == "__main__":
#    for param in sys.argv:
#        print (param)
f= open(port,"r+b") 
print "Get ID:"
CamCmd(f,"\x09\x04\x22")
print "Get Version:"
CamCmd(f,"\x09\x00\x02")
print "Get Zoom pos:"
CamCmd(f,"\x09\x04\x47")
print "Get resolution:"
r=CamCmd(f,"\x09\x06\x23")
print("resolution mode :"+ans_DecodeResolution(r)) 

print("end")



