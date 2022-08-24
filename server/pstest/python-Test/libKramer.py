import sys

def KramerRead(f):
    res=""
    while 1>0:
        v=f.read(1)
        if ( v=='\n'):
            break
        res=res+v
    f.read(1)  
    return res
        
def KramerCmd(f, cmd ):
    fcmd = "#"+cmd;
    f.write(fcmd+"\n")
    rd = KramerRead(f)
    print( ">> {0} << {1}".format(  fcmd ,  rd ))
    return rd
    
def openport():
    return open("/dev/ttyS5","r+") 

#from libKramer import *
#KramerCmd(f,"VERSION?")
