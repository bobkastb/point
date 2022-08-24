const fs = require("fs");
const path = require("path");

// AV, VID, AFV 
// "AUD? *" "VID? *" "SIGNAL? *" "DISPLAY? *" "MODEL?"  "PROT-VER?"
//D:\work\General\point.git\tools\devemul\switch\switch.data.json 

//~NN@ERR XXX<CR><LF> - when general error, no specific command
//~NN@CMD ERR XXX<CR><LF> - for specific command
function getMaindir() { return path.dirname(process.argv[1]) }
function log(...args) {
    console.error(...args)
   // fs.writeFileSync(process.stderr.fd, args.join(' ')+"\n", {encoding: "utf-8"});
}
function writeout(retm) {
    log("switch>>",retm)
    //fs.writeFileSync(process.stdout.fd,retm+"\r\n");
    try {
    process.stdout.write(retm+"\r\n");
    } catch (e) {
        log("!!Closed connection",e)
    }
    
    //console.log(retm)
}
const ctx={
    swstate:undefined,
    changes:{ VID:0xFFFFFFFF },
    swdb_lastwrite:undefined,
    deferred_sends:[],
    env:{prgdir:getMaindir()},
    cfg:undefined,
}
const switchDB= path.join( getMaindir() , "switch.data.json" );
const configFile= path.join( getMaindir() , "switch.fmap.json" );
//let swstate=undefined;

function getUnixTimeMs(){  return (new Date()).valueOf();}
function replace_env_s(s){
    let re = /\$\{(\w+)\}/g;
    let e= s.replace(re, (v,v1)=>{  return v1 in ctx.env ? ctx.env[v1]:v }  );
    return e;
}
function preparecfg(cfg){
    for(let k in cfg ){
        let tp=typeof cfg[k];
        switch (tp){
            case "string": cfg[k]=replace_env_s(cfg[k]); break;
            case "object": preparecfg(cfg[k])
        }
    }
}
function loadconfig(){
    if (ctx.cfg) return;
    ctx.cfg = JSON.parse( fs.readFileSync(configFile, "utf8") );
    preparecfg(ctx.cfg);
}
function getstate( cash ){
    //if (cash && ctx.swstate) return ctx.swstate
    let tm= fs.statSync(switchDB).mtime.valueOf();
    //log("getstate check ",tm <=ctx.swdb_lastwrite, Boolean(ctx.swstate) )
    if ( tm<=ctx.swdb_lastwrite && ctx.swstate ) return ctx.swstate
    laststate=ctx.swstate;
    ctx.swstate = JSON.parse( fs.readFileSync(switchDB, "utf8") );
    ctx.swdb_lastwrite= getUnixTimeMs();
    if (laststate) { onExternalUpdateDB(laststate,ctx.swstate); }
    
    return ctx.swstate
}

function changes( nm , index ){
    ctx.changes[nm] |= (1 << index)
}

function check_OnChanges(){
    let vid = ctx.changes.VID; ctx.changes.VID=0;
    //log(ctx.cfg)

    if (vid) for (let k in ctx.cfg.output ) { 
        const numO=Number(k)
        if (!( vid & (1<<(numO-1)) )) continue;
        const srcNum= ctx.swstate.state.VID[numO-1];
        const src =String(ctx.cfg.input[srcNum]).trim(); 
        const destP=String(ctx.cfg.output[k]);
        const isabsp = path.isAbsolute( destP );
        let fnm=  isabsp ? destP : path.join( ctx.cfg.fpath , destP );
        //log("check in ", k , numO , srcNum , fnm );
        if (!fs.existsSync(fnm) ) { continue; }
        log(`change input [${k}] < ${src} [${srcNum}] for: ${fnm}  `);
        fnm = isabsp ? fnm : path.join(fnm,'device.data');
        fs.writeFileSync( fnm , `input=${src}\n` )
    }
}

function onExternalUpdateDB( olds, news ){
    log("onExternalUpdateDB..." )
    let check_C=(nm) =>{
        let a = [olds.state[nm],news.state[nm]];
        for (let i in a[0]) {
            if (a[0][i]!=a[1][i]) { 
                push_deferred_sends(doret(nm,`${a[1][i]}>${Number(i)+1}`)); 
                changes(nm , i);
            }
        }
    }
    check_C("VID");
    check_C("AUD");
    let check_S=(nm) => {
        let a = [olds.state[nm],news.state[nm]];
        for (let i in a[0]) {
            if (a[0][i]!=a[1][i]) push_deferred_sends(doret(nm,`${Number(i)+1},${a[1][i]}`))
        }
    }
    check_S("SIGNAL");check_S("DISPLAY");
    //SIGNAL DISPLAY
}
function push_deferred_sends(v){ ctx.deferred_sends.push(v) }
function flush_deferred_sends(){
    for (let v of ctx.deferred_sends)
        writeout(v)
    ctx.deferred_sends=[]
    check_OnChanges();
}
function savedb(  ){
    fs.writeFileSync(switchDB,  JSON.stringify(ctx.swstate,null,' ') , {encoding: "utf8"});
    ctx.swdb_lastwrite= getUnixTimeMs()
}
function makeerr(errnum){
	let st=getstate(true);
	return `~${st.deviceid}@ERR ${errnum}`;
}

function doret(cmd,data){
    const st = getstate(true);
    return `~${st.deviceid}@${cmd} ${data}`;
}

function checkDBchange(){
    fs.statSync(switchDB).mtime.valueOf()
} 

function handleConnect( scmd, data , savedf ){
    const st = getstate(true);
    if (!savedf) savedf=[scmd];
    let da = data.split(',');
    let rv=[];
    for (let d of da) {
        if (!d.match(/^\d+\>\d+$/)) return makeerr(9);
        let sa= d.split('>');
        for (let i=0;i<2;i++) {
            sa[i] = Number(sa[i]);
            if (sa[i]<1 || sa[i]>st.ccount) return makeerr(9);
        }
        rv.push(d);
        for (let anm of savedf) {
            let na = st.state[anm]; let k=sa[1]-1;
            if (na[k]!=sa[0]) changes(anm , k );
            na[k] = sa[0];
        }
    }
    for (let r of rv) {
        writeout( doret(scmd,r) )
    }
    return '';
}
function handleSN( scmd, data ,re  ){
    if (!data.match(re)) return makeerr(9);
    const st = getstate(true);
    st.state[scmd] = Number(data);
    return doret(scmd,data)
}

function handlecommand( incmd ){
    incmd = incmd.trim();
    //log(`handlecommand( ${incmd} )`)
	let mr=incmd.match(/^#([\w-]+)((\?)( (\*))?| ([,\d\>]+))$/)
	if (!mr) return makeerr(2)
	//if (mr[4] )
    let isget = (mr[3])?(mr[5]?'*':'?'):'' //?
    let data = mr[6]
    let scmd=mr[1];
    let st = getstate();
    let result='';
    if (!isget) { 
        switch (scmd) {
        case "AFV": result=handleSN(scmd,data,/^0|1$/); break;
        case "AUD": 
        case "VID": result=handleConnect(scmd , data); break;
        case "AV": result=handleConnect(scmd , data , ["AUD","VID"]); break;
        default: return makeerr(5)
        }
        savedb();
        return result;

    } else {
        let a=st.state[scmd];
        if (a==undefined) return makeerr(3)
        switch (scmd) {
        case "AUD": case "VID": 
            if (isget!='*') return makeerr(4)
            return doret(scmd ,  a.map( (v,i)=>`${v}>${i+1}` ).join(','))
            break;
        case "SIGNAL": case "DISPLAY": 
            if (isget!='*') return makeerr(4)
            return doret(scmd ,  '*,'+a.join(','))
            break;
        default:
            if (isget=='*') return makeerr(4)
            return doret(scmd , a)        

    }}

	
}

function start(){
    let st= getstate();
    loadconfig();
    log("load switch. DB:",switchDB, st)
}

start();

process.on('exit',()=> log('Close switch connection') );
process.stdin.setEncoding('ascii');
process.stdin.on( "connect" , ()=> log('stdin connect!') )
process.stdin.on( "lookup" , ()=> log('stdin lookup!') )
process.stdin.on( "drain" , ()=> log('stdin drain!') )
process.stdin.on( "close" , ()=> log('stdin close!') )
let data = ""
//process.stdin.on(  )
process.stdin.on("data", (chunk) => {
    log( "switch<<", chunk );
    data += chunk;
    //let messages = data.split("\r");
    let messages = data.split(/\r|\n/);
    if (messages.length > 0) {
        data = messages[messages.length-1];
        messages = messages.slice(0, messages.length-1);
    }
    for (const msg of messages) {
		let retm =  handlecommand(msg.trim())
		/*
        const m = "echo " + msg;
        console.log(m);
        fs.writeFileSync(process.stderr.fd, "SENT DATA: " + m + "\n", {encoding: "utf-8"});
        */
       if (retm) writeout(retm);
        //console.log(retm);
    }
    flush_deferred_sends();
})


let timerfunc=()=>{
    //log("tick")
    getstate(true);
    flush_deferred_sends();
} 

process.stdin.on( "end" , ()=> { log('stdin end!'); process.exit(1); } )

setInterval( timerfunc , 1000 )

