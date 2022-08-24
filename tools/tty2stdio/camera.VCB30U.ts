const fs = require("fs");
const path = require("path");

const splitter=0xFF;
// AV, VID, AFV 
// "AUD? *" "VID? *" "SIGNAL? *" "DISPLAY? *" "MODEL?"  "PROT-VER?"
//D:\work\General\point.git\tools\devemul\switch\switch.data.json 

//~NN@ERR XXX<CR><LF> - when general error, no specific command
//~NN@CMD ERR XXX<CR><LF> - for specific command
function getMaindir() { return path.dirname(process.argv[1]) }
function getUnixTimeMs(){   return (new Date()).valueOf(); }

function log(...args) {
    console.error(...args)
   // fs.writeFileSync(process.stderr.fd, args.join(' ')+"\n", {encoding: "utf-8"});
}
function writeout(retm) {
    if (!Buffer.isBuffer(retm)) retm=Buffer.from(retm)
    //fs.writeFileSync(process.stdout.fd,retm+"\r\n");
    if (retm[retm.length-1]!=0xFF)
        retm=Buffer.concat([retm,Buffer.from([splitter])])
    log("camera>>",retm)
    process.stdout.write(retm);
}
const ctx={
    camidCod:0x90,
    camCmdCod:0x81,
    camdata:undefined,
    zoomdrive:{
        zoomstarted:undefined, 
        zoomstarted_pos:0, 
        zoom_dir:0,
    },
    xydrive:{
        started:undefined, 
        started_pos:[0,0], 
        dir:[0,0],
    },
    swdb_lastwrite:undefined
}
const cameraDB= path.join( getMaindir() , "camdata.VCB30U.json" );

function getstate( cash ){
    if (cash && ctx.camdata) return ctx.camdata
    ctx.camdata = JSON.parse( fs.readFileSync(cameraDB, "utf8") );
    let st=ctx.camdata;
    ctx.camidCod = (st.deviceaddr+8)<<4;
    ctx.camCmdCod = 0x80 | (st.deviceaddr & 0xF);
    //log(ctx)
    return ctx.camdata
}
function savedb(  ){
    fs.writeFileSync(cameraDB,  JSON.stringify(ctx.camdata,null,' ') , {encoding: "utf8"});
    ctx.swdb_lastwrite= getUnixTimeMs()
}


function makeerr(errnum,socket){
    let cod = { 'unknown':2,'syntax':0x02, 'full':0x03, 'canceled':0x04, 'nosocket':0x05, 'notexec':0x41 }[errnum];
    if (!cod) throw Error(`Invalid errnum ${errnum}`);
    return [ ctx.camidCod , 0x60+(socket==undefined?0:socket&0xF) , cod ]
}
function outerr(errnum,socket,inf){
    log('error:',inf)
    writeout(makeerr(errnum,socket));
}
function retCMD( code , socket ){
    return [ctx.camidCod, code|(socket==undefined?1:socket) ]
}
function retACK(  socket? ){ return retCMD( 0x40, socket)  }
function retCompletion(  socket? ){ return retCMD( 0x50, socket)  }
function sendData( data ) {  writeout([ctx.camidCod,0x50,...data]);  }

function writeACKs(){ 
    writeout(retACK());
    writeout(retCompletion());
}

function setdata( name , v ){
    let st=getstate(true);
    if (Array.isArray(v) && v.length==1) v=v[0];
    st.data[name]=v;
    savedb();
    writeout(retACK());
    writeout(retCompletion());
    return 0;
}

function maxmin( v , lo,hi) { return v<lo? lo :v>hi? hi:v;}

function checkdrive( dosave=undefined ){
    let z = ctx.zoomdrive;
    if (z.zoomstarted) {
        let st=getstate(true);
        let t=getUnixTimeMs() - z.zoomstarted;
        let lim= st.limits.ZoomPos;
        let speed= z.zoom_dir*( lim[1] - lim[0] )/5000;
        let newp = Number(z.zoomstarted_pos) + speed*t;
        st.data.ZoomPos = maxmin( newp,lim[0],lim[1] );
        log('---zoom:',st.data.ZoomPos )
        if (dosave) savedb();
    }
    let d = ctx.xydrive;
    if (d.started){
        let st=getstate(true);
        let t=getUnixTimeMs() - d.started;
        let lim= st.limits.PanTiltPos;
        let newp =[0,0];
        for (let i=0;i<2;i++) {
            let speed= d.dir[i]*( lim[i][1]-lim[i][0])/3000 ;
            newp[i] = d.started_pos[i] + speed*t; 
            newp[i] = maxmin( newp[i], lim[i][0] , lim[i][1] );
        }
        st.data.PanTiltPos = newp;
        if (dosave) savedb();
    }

}
function startzoom( cod ) {
    switch (cod) {
        case 0: { checkdrive(true); ctx.zoomdrive.zoomstarted=undefined; break; }
        case 2: case 3: { 
                ctx.zoomdrive.zoom_dir = cod==2 ? 1:-1;
                ctx.zoomdrive.zoomstarted = getUnixTimeMs(); 
                ctx.zoomdrive.zoomstarted_pos=getstate(true).data.ZoomPos; }
                break;
        default: { outerr('syntax',0,`Invalid zoom cod ${cod}`); return; }
    }
    writeACKs();
}
function startdrive(buff){
    let d = ctx.xydrive;
    let bdir=buff.slice(2);
    let dir=[0,0];
    let map={ 1:1,2:-1,3:0};
    for (let i=0;i<2;i++) { 
        let v=map[bdir[i]];
        if (v==undefined) { outerr('syntax',0,`Invalid drive cod ${bdir.toString('hex')}`); return; }
        dir[i] = v;
    }
    if (dir[0]==0 && dir[1]==0 ) { 
        checkdrive(true); d.started=undefined; 
    } else {
        let st = getstate(true);
        d.started = getUnixTimeMs(); 
        d.started_pos= st.data.PanTiltPos; 
        d.dir=dir;
    };
    writeACKs();
}
function handleCommand(msg){
    let st=getstate(true); let smsg=msg.toString('hex');
    let hmsg=msg.slice(2,4).toString('hex');
    let waserror=false;
    let invalidLen=()=>{ outerr('syntax',0,`Invalid command length ${smsg}`); waserror=true; return -1; }
    let invalidData=()=>{ outerr('syntax',0,`Invalid data in command  ${smsg}`); waserror=true; return -1; }
    let invalidLims=()=>{ outerr('notexec',0,`Invalid data not in limits  ${smsg}`); waserror=true; return -1; }
    let checklimits=(v , name)=>{ 
        let lim=st.limits[name]; if (!lim) return 0;
        if (!Array.isArray(v)) {
            if (!(v>=lim[0]&&v<=lim[1])) return invalidLims();
        } else 
            for(let i in v) 
                if (! ( v[i]>=lim[i][0]&&v[i]<=lim[i][1] ) ) return invalidLims();
        return 0;
    }
    let setparamBool=( buff , name )=>{
        if (buff.length!=1) return invalidLen();
        let v= buff[0]==2? true : buff[0]==3? false : undefined;
        if (v==undefined) return invalidData();
        return setdata(name,v);
    }
    let setparamX1=( buff , name )=>{
        let l = (Array.isArray(st.data[name]))?  st.data[name].length : 1;
        if (buff.length!=l) return invalidLen();
        let v= l>1 ? Array.from(buff) : buff[0] ;
        if (checklimits( v , name )) return -1;
        return setdata(name,v);
    }
    let setparam04=( buff , name )=>{
        let l = (Array.isArray(st.data[name]))?  st.data[name].length : 1;
        if (buff.length!=l*4) return invalidLen();
        let v=[];
        for (let i=0;i<l;i++) { let x=0; 
            for (let j=0;j<4;j++) {
                let b = buff[i*4+j]; if (b & 0xF0) return invalidData();
                x = (x<<4) | b;  
            } 
            v.push(x)
        }
        if (checklimits( v , name )) return -1;
        return setdata(name,v);
    }
        //let dmsg4 = msg.slice(4);
    switch (hmsg){
        case '0400': setparamBool( msg.slice(4), 'Power'  ); break;
        case '0407': if  (msg.length!=5) return invalidLen();
                     startzoom( msg[4] ); break;
        case '0447': setparam04( msg.slice(4), 'ZoomPos'  ); break;
        case '0438': setparamBool( msg.slice(4), 'FocusAuto'  ); break;
        case '0448': setparam04( msg.slice(4), 'FocusPos'  ); break;
        case '0422': setparam04( msg.slice(4), 'UserTagId'  ); break;
        case '0602': setparam04( msg.slice(6), 'PanTiltPos'  ); break;
        case '0601': if  (msg.length!=8) return invalidLen(); 
                     startdrive( msg.slice(4) ); break;
        case '043f': 
                if (msg[4]>2) return outerr('syntax',0,`Invalid memory command ${smsg}`)
                setparamX1( msg.slice(5), 'Preset'  ); 
                break;
        default: return outerr('unknown',0,`Invalid set command ${hmsg}`)       

    }
}
function bool2A( d ) { return [ (d?2:3) ] };
function datatoaP4( d ){
    if (!Array.isArray(d)) d=[d];
    let res=[];
    for (let v of d) {  
        for (let i=0;i<4;i++) { res.push((v >> 12)&0xF); v<<=4; }
    }
    return res;
}
function handleInquiry(msg){
    let st=getstate(true);
    let hmsg=msg.slice(2).toString('hex');
    switch (hmsg){
        case '0002': return sendData( st.data.Version )
        case '043f': return sendData( [ st.data.Preset ]  ) // memory
        case '0400': return sendData( bool2A( st.data.Power ) )
        case '0438': return sendData( bool2A( st.data.FocusAuto ) )
        case '0447': return sendData( datatoaP4( st.data.ZoomPos ) )
        case '0448': return sendData( datatoaP4( st.data.FocusPos ) )
        case '0422': return sendData( datatoaP4( st.data.UserTagId ) )
        case '0611': return sendData( st.data.MaxSpeed )
        case '0612': return sendData( datatoaP4( st.data.PanTiltPos ) )
        default: outerr('unknown',0,`Invalid inq command ${hmsg}`)
    }
}


function handlemessage(msg){
    let st=getstate(true);
    if (msg[0]!=ctx.camCmdCod) return outerr('syntax',0,`Invalid first byte ${msg[0]}`);

    if (msg[1]==0x01) return handleCommand(msg)
    if (msg[1]==0x09) return handleInquiry(msg)
    return outerr('syntax',0,`Invalid second byte ${msg[1]}`);
    //writeout(msg)

}


function start(){
    let st= getstate(false);
    log("load camera DB:",cameraDB)
}

start();

process.on('exit',()=> log('Close camera connection') );
//process.stdin.setEncoding("hex");
process.stdout.setEncoding("binary");
process.stdin.on( "connect" , ()=> log('stdin connect!') )
process.stdin.on( "lookup" , ()=> log('stdin lookup!') )
process.stdin.on( "drain" , ()=> log('stdin drain!') )
process.stdin.on( "close" , ()=> log('stdin close!') )

function splitbuffer(buff, splitter=0xff){
    let res=[]; let last=0;
    if (!buff.length) return 
    for (let i=0;i<buff.length;i++)
      if (buff[i]==splitter) { res.push( buff.slice(last,i) ); last=i+1; }
    res.push(buff.slice(last,buff.length))  
    return  res; 
}

let data = Buffer.alloc(0)
//process.stdin.on(  )
process.stdin.on("data", (chunk) => {
    log( "cam<<", chunk );
    data = Buffer.concat([data, chunk]);
    
    //let messages = data.split("\r");
    let messages = splitbuffer(data,0xFF);
    //log( "messages:", messages );
    if (messages.length > 0) {
        checkdrive();
        data = messages.pop();
        for (const msg of messages) 
            handlemessage(msg)
    }
})


process.stdin.on( "end" , ()=> { log('stdin end!'); process.exit(1); } )


