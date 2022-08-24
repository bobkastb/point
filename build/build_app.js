const btool = require("./build-tool");
const fs = require("fs");
const path = require("path");
const { forEachChild } = require("typescript");


let workEnv={}
//const envCtx={ env:workEnv, stat:{ cnt:0 } }

function strGeneralBase( stra ){
    if (typeof(stra) !== "object") return stra;
    let res = stra[0];
    for(let is in stra) { 
        if (is==0) continue;
        s=stra[is];
        if (s.startsWith(res)) continue
        const cnt = res.length<s.length ? res.length: s.length;
        let c=0
        for (;c<cnt-1 && (s[c]==res[c]);c++ );
        res= res.substring(0,c)
    }
    return res;
}

function load_json(fn){
    let txtcont = fs.readFileSync(  fn , "utf8")
    txtcont= txtcont.replace(/\/\/.*$/mg,"")
    return JSON.parse( txtcont )
    
}

function copyFields(dst, src) {
    let e = Object.entries(src);
    for (let c of e) 
        dst[c[0]] = c[1];
}

function makeEnvStat() {
 return { count: 0, errs: {} , 
    errCnt(){ return Object.keys(this.errs).length } 
    ,reset() { this.count=0; this.errs={} }
    ,errInfo() { return Object.keys(this.errs).join(','); }
    }
}


//type CtxReplace = { count: number; errs: { [keys: string]: number } }
function replace_env_E(s, envStat ) {
    let re = /\$\{(\w+)\}/g;
    let e = s.replace(re, (v, v1) => {
        envStat.count++;
        if (v1 in workEnv) return workEnv[v1]; envStat.errs[v]++; return v;
    });
    return e;
}

function ClosureEnvByObjs( ...objlist  ){
    for (let obj of objlist ){
        ClosureEnvByObjF( obj )
    }
}
function ClosureEnvByObjF( obj  ){
    envStat = makeEnvStat()
    let changes=1;
    let keyslist = [];
    for (let nm in obj) if (nm[0]=="@" && typeof(obj[nm]=="string")) keyslist.push(nm);
    while (changes) {
        changes=0; envStat.reset();
        for (let nm of keyslist){
            nmE = nm.substring(1);
            newv=replace_env_E( obj[nm] , envStat )
            changes += (obj[nm]!=newv) ? 1 : 0;
            obj[nm]= workEnv[nmE] = newv;
        }
    }
    if (!envStat.errCnt()) for (let nm of keyslist){
        nmE = nm.substring(1);
        obj[nmE]= obj[nm];
        delete obj[nm]
    }
    if (envStat.errCnt()) 
        throw `Invalid environment var references: ${ envStat.errInfo() } `;
    return envStat;
}

function EnvExpandFields( ...objlist ){
  for ( let obj of objlist) {
    envStat = makeEnvStat()
    for (let nm in obj ) 
        if (typeof(obj[nm])=="string") 
            obj[nm]=replace_env_E( obj[nm] , envStat )
    if (envStat.errCnt()) 
        throw `Invalid environment var references: ${ envStat.errInfo() } `;
  }    
}

function CopyFieldsRecurse( dst , src ) {
    let e = Object.entries(src);
    for (let c of e) { 
        let v=c[1]; let k=c[0];
        if (typeof(v)=="object" && !Array.isArray(v)) {
            if (typeof(dst[k])!="object") 
                dst[k] = v;
            else 
                CopyFieldsRecurse(dst[k],v)
        } else 
            dst[k] = v;

    }    
}
//--------------- end tools ---------


function makeLEnv(){
    const lEnv = {
        SolutionDir: path.normalize( process.cwd() + "/..")
        ,ProjectDir:process.cwd()
    }
    copyFields( workEnv, process.env );
    copyFields( workEnv, lEnv );
    return workEnv
}

function parseRemoteServer( prjCfg ){
    let idx ={}
    for (let rs of prjCfg.remoteservers.list){
        if (rs.names) for (let nm of rs.names) {
            idx[nm] = rs.addr;
        }
    }
    let v = workEnv.solution_remote_server
    //if (!v.match(/^\d+\.\d+\.\d+\.\d+$/))
    if (v in idx) v = idx[v]
    workEnv.solution_remote_server = v
}

module.exports.loadCtx = loadCtx
function loadCtx(){
    makeLEnv();
    let envStat = { count: 0, errs: { } , errCnt(){ Object.keys(this.errs).length } }
    let prjCfg = load_json("tsconfig.json"); // console.log( tscCfg.tbbuild );
    let slnCfg = load_json(workEnv.SolutionDir+"/build/buildcfg.json"); // console.log( tscCfg.tbbuild );

    CopyFieldsRecurse( slnCfg , prjCfg )
    prjCfg = slnCfg

    for( let nm in prjCfg.default_env ) {
        if (!(nm in workEnv)) 
            workEnv[nm] = prjCfg.default_env[nm]
    }
    parseRemoteServer(prjCfg)

    ClosureEnvByObjs( prjCfg.aBuildDirs , prjCfg.aBuildOptions );
    EnvExpandFields(prjCfg.aBuildDirs , prjCfg.aBuildOptions )

    
    copyFields(btool.options ,prjCfg.aBuildOptions );

    const ctx = {
        prjCfg: prjCfg
        ,tscOutDir : prjCfg.compilerOptions.outDir
        ,assembly_dir : prjCfg.aBuildDirs.assembly_dir
        ,rootDirs_TscOut:[]
        ,rootDirs_TscOutMsk:[] 
        ,baseOutDir:undefined
        ,oneFile: prjCfg.aBuildOptions.oneFile
        ,aBuildOptions : prjCfg.aBuildOptions
        ,allowRootDirs:false
        ,npmBuildDir : btool.findNpmBin()
    }     

    let cdir = process.cwd();
    if (prjCfg.compilerOptions.rootDirs) {
        ctx.allowRootDirs= true;
        let rootDirs=[]; let rootDirsMsk=[]
        for (let d of prjCfg.compilerOptions.rootDirs) { rootDirs.push( path.normalize(cdir+"/"+d) ); }
        ctx.baseOutDir = strGeneralBase(rootDirs)
        for (let i in rootDirs) { 
            rootDirs[i] = ctx.tscOutDir+"/"+path.relative( ctx.baseOutDir, rootDirs[i] ) ; 
            ctx.rootDirs_TscOutMsk.push(rootDirs[i]+"/**")
        }
        ctx.rootDirs_TscOut= rootDirs;
    } else {
        ctx.baseOutDir =path.normalize(cdir+"/"+prjCfg.compilerOptions.outDir)
    }
    return ctx;
}

module.exports.isAllowBuild = isAllowBuild
function isAllowBuild( ctx ) {
   // return ctx.aBuildOptions.allowBuild  ? true : false
   return true;
}

module.exports.PrintParams = PrintParams
function PrintParams(ctx){
    let res=[]
    for (let nm in ["solution_remote_server","pe_build_Only"] ){
        let v = workEnv[nm]
        if (v) res.push(`${nm}=${v}`) 
    }
    return `{${res.join(", ")}}`;
}

module.exports.BuildServer = BuildServer
async function BuildServer( rebuild ) {
    const ctx = loadCtx();
    console.log(`${rebuild?"Rebuild>" :"Build"}  npm bin catalog: ${ ctx.npmBuildDir } params:${PrintParams(ctx)}` )

    //strGeneralBase
    const cmd_options= ctx.aBuildOptions.cmd_options
    let copyopts = {  changed:true , display:false   };
    let mainJsFile = ctx.aBuildOptions.mainJsFile;
    
    if (isAllowBuild(ctx) ) {
        // check to change files ctx.rootDirs_TscOut compare Sources
        //tsconfig.json
        let include = [...ctx.prjCfg.include,"tsconfig.json"];
        need_tsc = rebuild || (await btool.checkchangeInput(include, ctx.rootDirs_TscOutMsk ) ) ;
        if (need_tsc) {
            await btool.syscmd('tsc', cmd_options)
        }    
        if (ctx.oneFile) {
            await btool.copyFiles( ctx.rootDirs_TscOutMsk.slice(1) , ctx.rootDirs_TscOut[0] , copyopts )
            if( rebuild || (await btool.checkchangeInput(ctx.rootDirs_TscOutMsk[0], ctx.assembly_dir+"/"+mainJsFile) ) )
                await btool.syscmd(`ncc build ${ctx.rootDirs_TscOut[0]}/${mainJsFile} -o ${ctx.assembly_dir}`, cmd_options)
        } else {
            let copyres = await btool.copyFiles( ctx.rootDirs_TscOutMsk , ctx.assembly_dir , copyopts )
        }
    }

    await copy2RemoteServer(ctx);
    console.log("Build complete")
        
}    

module.exports.printEnvOpts = printEnvOpts
async function printEnvOpts(){
    const cmd_options = { noNpmDir : true };
        await btool.syscmd('tsc -v', cmd_options)
        await btool.syscmd('where tsc', cmd_options)
        await btool.syscmd('cd', cmd_options)

}

module.exports.copy2remote = copy2remote
function isAllowremoteCopy(ctx){
    //return ctx.aBuildOptions.allowRemoteCopy && !workEnv.pe_build_Only ? true : false;
    return !Boolean(workEnv.pe_build_Only)
}
async function copy2remote( ctx , src , dst ) {
    let bo = ctx.aBuildOptions
    if (!isAllowremoteCopy( ctx ) ) return;
    //if (!workEnv.solution_remote_server) throw "invalid"
    const copyopts = {  changed:bo.allowRemoteCopy!="all" , display:false   };
    await btool.copyFiles( src , dst , copyopts )
    //console.log( `btool.copyFiles( ${src} , ${dst} , copyopts ) ` )
}

function getDistFilesSet(ctx , ddir ){
    let res=[]
    //console.log("distFiles:",ctx.prjCfg.aBuildOptions.distFiles)
    for (let f of ctx.prjCfg.aBuildOptions.distFiles) res.push( ddir+"/"+f );
    //console.log("distFiles res:",res)
    return res;
}

module.exports.copy2RemoteServer = copy2RemoteServer
async function copy2RemoteServer( ctx ){
    if (!ctx) {
         ctx = loadCtx();
    }     
    if (!isAllowremoteCopy(ctx ) ) return;
    let mainJsFile = ctx.aBuildOptions.mainJsFile;
    let assembly_remotedir = ctx.prjCfg.aBuildDirs.assembly_remotedir
    //console.log(`Copy to remote server:`, assembly_remotedir )

    if (ctx.oneFile) {
        await copy2remote( ctx , `${ctx.assembly_dir}/${mainJsFile}` , assembly_remotedir )
    } else {
        let f_inassemply = getDistFilesSet(ctx, ctx.assembly_dir )
        //console.log(`copy2remote( ctx , ${f_inassemply} , ${assembly_remotedir} )`)
        await copy2remote( ctx , f_inassemply , assembly_remotedir )
    }    

}


function main_test(){
    jsfile = __filename;
    if (path.basename(process.argv[1]) != path.basename(jsfile)) return;
    // debug run!
    console.log( "cwd:" , process.cwd() , process.argv  )
    //process.chdir("./mediaserver")
    process.chdir("./server")
    console.log( "cwd:" , process.cwd() )
    //BuildServer(true)
    printEnvOpts()
    //copy2RemoteServer()
    
    //fs.readFileSync( "server/tsconfig.json", "utf8")
    //fs.
}

main_test()