const fs=require("fs");
const cnst= require("constants");

async function wait(ms) {
    if (ms)
        await new Promise(r => setTimeout(r, ms));
    else
        await new Promise(r => setImmediate(r));
}


function open(fpath) {
    console.log("open:",fpath)
    fctx= {
    fd : fs.openSync(fpath, cnst.O_RDWR | cnst.O_NOCTTY | cnst.O_NONBLOCK)
    ,sep:0xFF
    ,msgs:[]
    ,data:Buffer.alloc(0)
    } 
    readcicle(fctx);
    return fctx;
}
function close(fctx) {
    fs.closeSync(fctx.fd);
    fctx.fd=undefined;
}

function open2(fpath) { 
    return open("/home/q/serial/redir2")
}

function peek_m(fctx) {
    let m = fctx.msgs; fctx.msgs=[];
    return m;
}
async function wait_m(fctx,cnt) {
    let to=1000; let delta=10;
    if (cnt==undefined) cnt=1;
    while (fctx.msgs.length<cnt && to>0) {
        await wait(delta); 
        to -= delta; 
    }
    if (fctx.msgs.length<cnt) { console.log("Timeout wait input!"); }
    return peek_m(fctx)
}
function write(fctx,adata) {
    let buf=Buffer.from(adata);
    if (buf[buf.length-1]!=fctx.sep) { buf=Buffer.concat([buf,Buffer.from([fctx.sep])]) }
    console.log("send >>:", buf )

    fs.writeSync(fctx.fd, buf, 0, buf.length, null);
}    
async function awrite(fctx,adata,anscheck) {
    write(fctx,adata);
    ra=await wait_m( fctx, (anscheck ? anscheck.cntans : undefined) ); 
    if (anscheck && anscheck.func) for (let i in ra)
        anscheck.func(anscheck,ra[i],i)
    return ra
}

function onRecieveMessages( fctx , msgs ){
    fctx.msgs = fctx.msgs.concat(msgs);
    for (let m of msgs)
        console.log("recieve <<:",m)
}    

function splitbuffer(buff, splitter=0xff){
    let res=[]; let last=0;
    if (!buff.length) return 
    for (let i=0;i<buff.length;i++)
      if (buff[i]==splitter) { res.push( buff.slice(last,i) ); last=i+1; }
    res.push(buff.slice(last,buff.length))  
    return  res; 
}


async function readcicle( fctx ){
    rbuf= Buffer.alloc(1024);

    while(fctx.fd!=undefined) {
        //lastrec = fs.readSync( fctx.fd, rbuf, 0, rbuf.length, null);
        let lastrec=0;
        try {
            lastrec = fs.readSync( fctx.fd, rbuf, 0, rbuf.length, null);
        } catch (e) {
            //console.log('ERROR . read', lastrec)
            if (e.code=='EAGAIN') {} 
            else throw e;
        }
        if (lastrec) {
            fctx.data = Buffer.concat([ fctx.data, rbuf.slice(0,lastrec) ]) 
            //console.log('input:',rbuf.slice(0,lastrec))
            let msgs=splitbuffer(fctx.data,fctx.sep);
            if (msgs.length>1) {
                fctx.data = msgs.pop()
                onRecieveMessages( fctx , msgs )
            }    
        }    
        if (lastrec<rbuf.length) {
            await wait(10);
        }
    }

}

 function cmp_array(a1,a2){ 
    //return Buffer.compare(  )
    if (a1.length!=a2.length) return 1;
    for(let i=0;i<a1.length;i++) if (a1[i]!=a2[i]) return 1;
    return 0;
 } 

async function test() { 
    let fctx = open2()
    let setgetcmp=async ( setcmd , getcmd, getpreA , data  )=>{
        let ans= await awrite(fctx,[ ...setcmd , ...data ],{cntans:2})
        //console.log('end set, do get...', ans)
        ans= await awrite(fctx, getcmd )
        let exp = [ ...getpreA , ...data ];
        if (cmp_array( ans[0] , exp )) { console.error("invalid answer! wait:",exp ); return 1;}
        return 0;
    }
    let setgetcmpS=async ( cmdid, data  )=>{
        return setgetcmp( [0x81,01,04,cmdid] , [0x81,09,04,cmdid] , [0x90,0x50] , data  )
    }    
    let inqConst=async ( getcmd , retlen )=>{
        let ans= await awrite(fctx,getcmd)
        ans=ans[0];
        if (ans.length != retlen)  { console.error("invalid answer len! " ); return -1; }
        if (cmp_array( ans.slice(0,2) , [0x90,0x50] )) { console.error("invalid answer! wait:",exp ); return 1;}
        return 0;
    }

    try {
        await wait(10)
        
        await setgetcmpS( 0x00 , [02]); // power
        await setgetcmpS( 0x47 , [02,03,0x0f,0x0A] ); // zoom
        await setgetcmpS( 0x48 , [02,03,0x0A,0x0B] ); // focus
        await setgetcmpS( 0x38 , [02] ); // focus mode
        await setgetcmp( [0x81,01,0x06,02,0x18,0x18 ] , [0x81,09,06,0x12 ] , [0x90,0x50] , [4,3,2,1,8,7,6,5]  ) // Pan tilt
        await setgetcmpS( 0x22 , [1,2,3,4] ); // ID
        
        await setgetcmp( [0x81,01,04,0x3f ,01 ] , [0x81,09,04, 0x3f ] , [0x90,0x50] , [0x44]  ) // mem set
        await setgetcmp( [0x81,01,04,0x3f ,02 ] , [0x81,09,04, 0x3f ] , [0x90,0x50] , [0x10]  ) // mem recall
        await inqConst(  [0x81,09,06,0x11], 4 ) //version get expect: 90 50 mn pq FF
        await inqConst(  [0x81,09,00,0x02], 9 ) //version get expect: 90 50 00 20 mn pq rs tu vw FF
    } finally {    
        close(fctx);
    }
}

test();