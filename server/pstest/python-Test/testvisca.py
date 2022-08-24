
def readvisca(f):
 s='';
 while (1):
  c=f.read(1) 
  s+=c
  if c=='\xFF':
   break
 return s  

def printhexstr(s):
 ss='';
 for c in s:
  ss+=' '+hex(ord(c))
 return ss 

def viscaget(f,cmd):
 f.write(cmd); 
 print( printhexstr(readvisca(f)) )

def viscaset(f,cmd):
 f.write(cmd); 
 print( printhexstr(readvisca(f)) )
 print( printhexstr(readvisca(f)) )

f= open("/dev/ttyMI1","r+b")

# fix preset
viscaset(f,"\x81\x01\x04\x3F\x01\xPP\xFF") 
# recall preset
viscaset(f,"\x81\x01\x04\x3F\x02\xPP\xFF") 
#
viscaset(f,"\x81\x09\x7E\x7E\x02\xFF") 


#SET ID
viscaset(f,"\x81\x01\x04\x22\x01\x02\x03\x04\xFF") 

viscaget(f,"\x81\x09\x04\x22\xFF") 

 
viscacmd(f,"\x81\x09\x00\x02\xFF") 
viscacmd(f,"\x81\x09\x04\x22\xFF") 

viscacmd(f,"\x81\x01\x7E\x01\x18\x02\xFF"); f.read(3) 



printf("get state")
f.write("\x81\x09\x00\x02\xFF"); 
f.read(10)
f.write("\x81\x09\x04\x00\xFF"); 
f.read(4)

f.close()