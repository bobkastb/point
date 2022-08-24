const os = require("os");
const path = require("path");


if (!process.env.CACHE_DIR) process.env.CACHE_DIR = path.join(os.tmpdir(),"npm_cache")


const child_process = require("child_process");
const fs = require('fs');
//const glob = require('glob');

const goptions= {
    "cmd_options" : {},
    "verbose":0,
}
module.exports.options=goptions

const rollup = require("rollup");
const rollup_typescript = require('rollup-plugin-typescript2');
const rollup_resolve = require('@rollup/plugin-node-resolve');
const rollup_commonjs = require('@rollup/plugin-commonjs');
const rollup_builtins = require('rollup-plugin-node-builtins');
const { fileURLToPath } = require("url");

module.exports.prep_rollupPlugins = prep_rollupPlugins
function prep_rollupPlugins( options ) {

  rollupPlugins = [
    rollup_builtins(),
    rollup_typescript({
        typescript: require('typescript'),
        tsconfig: options.typescript ? options.typescript : "./tsconfig.json",
    }),
    rollup_resolve({preferBuiltins: false}),
    rollup_commonjs({
        namedExports: {}
    }),
  ];
return rollupPlugins
}


module.exports.do_rollup = do_rollup
async function do_rollup(options) {
    const bundle = await rollup.rollup(options);
    await bundle.write(options.output);
    //return null;
};

module.exports.runCommand = runCommand
async function runCommand(options,extCmd , ...args) {
    let err= await new Promise((resolve) => {
        let proc;
        if (!/^win/.test(process.platform)) { // linux
            proc = child_process.spawn(extCmd, args, {stdio: [process.stdin, process.stdout, process.stderr]});
        } else { // windows
            extCmd1 = extCmd.replace(/\//g,"\\")
            nargs = [extCmd1,...args];
            if (options.log || goptions.verbose>0 )
                console.log("exec:", ...nargs);
            proc = child_process.exec(nargs.join(" "))
            proc.stdout.on('data',(data)=>console.log(data))
            proc.stderr.on('data',(data)=>console.error(data))
        }
        proc.on("exit", (code) => resolve(code ? { extCmd, errCode:code  } : null));
        proc.on("error", (err) => resolve(err));
});
    if (err && options.throwError) 
        throw err;
    return err;
}

const cache_findNpmBin={}

module.exports.findNpmBin = findNpmBin
function findNpmBin( findf = '/node_modules/.bin'){
    if (cache_findNpmBin[findf]) 
        return cache_findNpmBin[findf];
    let dir= fs.realpathSync("."); 
    let result;
    while (true) {
        if ( fs.existsSync(dir+findf) ) {
            result= fs.realpathSync(dir+findf);   
            break;
        }    
        let npath = fs.realpathSync(dir+"/..");
        if (npath==dir)
            break;
        dir = npath
    }
    cache_findNpmBin[findf]= result;
    return result; 
}

module.exports.cmd = cmd
async function cmd( cmdl , options ){
    cmdl = cmdl.trim()
    let prg= cmdl.split(' ')[0]
    if (!options.noNpmDir) {
        let dir= findNpmBin();
        if (dir) dir+='/'
        if (fs.existsSync(dir+prg)) 
            cmdl= dir+cmdl
    }
    let sa= cmdl.split(' ');
    //if (options.log) console.error("cmd:",sa.join(" "))
    let err = await runCommand( options, ...sa )
    if (err && (options.log || goptions.verbose>0)) 
        console.error("Error in cmd:",err)
    return err;
}
module.exports.syscmd = syscmd
async function syscmd( cmdl , options ){
    if (!options) options={}
    options.noNpmDir = true;
    return await cmd(cmdl , options)
}

function fileStat( path ){
    try {
        let r= fs.statSync( path )
        r.typefile = r.isFile() ? "f" : r.isDirectory() ? "d" : r.isSymbolicLink ? "l" : "other"
        return r;
    } catch (e)  {
        if (e.code=='ENOENT')
            return undefined; 
        throw e    
    }

}

function replaceAll(s, fstr, repstr){ return s.split(fstr).join(repstr); }

module.exports.getfileMTime = getfileMTime
async function getfileMTime( path ) {
    return fs.statSync( path ).mtime.getTime()
}

module.exports.getFilesMaxTime = getFilesMaxTime
async function getFilesMaxTime( files ){
    let tm=0
    await foreachfiles(files, (f)=>{
        tm = Math.max( tm , fs.statSync(f).mtime.getTime() )
    } )
    if (goptions.verbose>1) 
        console.log(`getFilesMaxTime( ${files} )=${tm}`)
    return tm;
    //let tms = files.map( x=>fs.fstatSync(x).mtime.getTime() );
    //return Math.max(...tms);
}

function foreachfiles_onepath_cball( cpath , callback , opts ){
    let r=foreachfiles_onepath(cpath , null , opts );
    callback( null, r ? r : [] )
}

module.exports.foreachfiles = foreachfiles
async function foreachfiles( files , callback ) {
    if (typeof files != "object") 
        files=[files]
    //fun_ff = glob    
    fun_ff = foreachfiles_onepath_cball
    return new Promise( (resf,rejf)=>{
        let cnt=files.length
        for ( let fpath of files) {
            fun_ff( fpath, (errg,files)=>{
                if (errg) { rejf( errg ); return; }
                //console.log(files)
                for (let f of files)
                    callback( f )
                cnt--;
                if (!cnt) resf(1)
            })
        } 
        if (!cnt) resf(1)
    });
}


module.exports.copyFiles = copyFiles
async function copyFiles( src , dst , opts ) {
    //if (goptions.verbose>1) console.log(`copyFiles from ${src} ==> ${dst})`)
    let stat = { newf:0 , all:0 , oldf:0 , nf:0 }
    //if (typeof src != "object") { src = [src];}
    if (typeof src == "object") {
        opts.isRecurseVerb = goptions.verbose_copyfilesres != "each"
        for (let nsrc of src){ 
            const cst= await copyFiles( nsrc , dst , opts );
            for (let nm in stat) { stat[nm] += cst[nm] }
        }
        if ( goptions.verbose_copyfilesres && opts.isRecurseVerb) 
            console.log("copyFiles stat:", stat, `from ${src} ==> ${dst})`)
        return stat
    }
    const ctx = new PathMatcher( src );
    let base = ctx.basepath != src ? ctx.basepath : path.dirname(src)
    let options = (typeof opts=="function" ? { cbf:opts }: typeof opts=="object" ? opts : {}  )
    options.display |= options.display || options.verbose>0 // { verbose, display , changed }

    async function fcopyfile(fn){
        let dfn=path.relative(base,fn)
        if (dfn.startsWith(".."))
            throw "Invalid path "+fn
        dfn = dst+"/"+dfn 
        stat.all++;
        let st= [ fileStat(fn) ,  fileStat(dfn) ]; 
        if (!(st[0].isFile() || st[0].isDirectory())) {
            stat.nf++; return; }
        let needupdate = true;    
        if (st[1])  {
            if (st[0].typefile!=st[1].typefile) 
                throw {error:"Distance dir tree difference!"}
            if ( st[1].isDirectory() )    
                needupdate = false;    
            if ( st[0].mtime.getTime() == st[1].mtime.getTime() && options.changed )    
                needupdate = false;    
        }   
        if (!needupdate) { stat.oldf++; return; }
        if (options.cbf && options.cbf( fn , dfn)===false )
            return
        if ( options.display || goptions.verbose>1)    
            console.log(`${ st[0].isFile()? "copy file": "mkdir"} ${fn} => ${dfn}`)    
        stat.newf++;
        fs.mkdirSync( path.dirname( dfn ) , { recursive:true } )
        if (st[0].isFile()) 
            fs.copyFileSync( fn , dfn )
    }

    await foreachfiles( src, fcopyfile )
    if ( goptions.verbose_copyfilesres && !opts.isRecurseVerb) 
        console.log("copyFiles stat:", stat, `from ${src} ==> ${dst})`)
    return stat
}    

module.exports.checkchangeInput = checkchangeInput
async function checkchangeInput( inpFiles , outFiles ) {
    const inModified = await getFilesMaxTime(inpFiles);
    const outModified = await getFilesMaxTime(outFiles);
    //console.log(`${inModified} > ${outModified}` , inModified > outModified )
    return (inModified > outModified); 
}


//module.exports = { getFilesMaxTime };

//const fsProm = require('fs/promises')
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports.removeLastSepPath = removeLastSepPath
function removeLastSepPath(s){
    return s.trim().replace(/[\/\\]$/,"");
}  

class PathMatcher{
    inPath=""
    basepath="";
    reFile=undefined
    recurse=false;
    relname=false;
    constructor (_path , inopts ) { this.inPath=_path;
        if (inopts) for (const onm in inopts) { this[onm] = inopts[onm] }
        this.initialize()
     }
    filter( fullpath ) { return !this.reFile ? true : 
        Boolean( fullpath.match(this.reFile))  }
    initialize(  ) {
        const pathChars="\/\\\\"
        const NofileChars=`<>:|?*`;
        //path.basename()
        let oldpmsk= this.inPath;
        let rr=[]; let sss=0; let allow_reFile = undefined;
        for(let x of this.inPath.matchAll(/[!?+*@]\([^)]*\)|\*\*[\/\\]\*|\*\*|\*|\?/g) ) { 
            rr.push( this.inPath.substring(sss, x.index) );
            rr.push( { pattern:x[0] } );
            sss = x.index+x[0].length;
            allow_reFile= true
        }
        if (sss<this.inPath.length) rr.push( this.inPath.substring(sss, this.inPath.length) );
        this.basepath=allow_reFile ? "" : this.inPath; let cnt_re=0;
        if (allow_reFile) {
            for (let i in rr){
                let pattern = rr[i].pattern;
                if (pattern == undefined) { // rr[i] is string
                    if (!cnt_re) this.basepath+=rr[i]; 
                    else 
                        this.recurse = this.recurse || Boolean( rr[i].match(/[\/\\]/) );
                    rr[i] =escapeRegex(rr[i]); 
                    continue;
                }
                cnt_re++;
                switch (pattern) { // pattern is regexp
                    case "?":  rr[i] = "[^"+pathChars+"]"; break;
                    case "*":  rr[i] = "[^"+pathChars+NofileChars+"]*"; break;
                    case "**/*":case "**\\*":
                    case "**":{ 
                        rr[i] = "[^"+NofileChars+"]*"; 
                        this.recurse = true;
                        break;
                        }     
                    default:
                        if (pattern.match(/^[!@?+*]\([^)]*\)$/) ) { // ( regexp )
                            if (pattern[0]=="!") throw("PathMatcher:constructon '!(' unsupported!")    
                            //TODO: могут встречаться * и вложенные скобки
                            rr[i] = pattern.substring(1) + (pattern[0]!="@"?pattern[0]:"");
                            this.recurse = this.recurse || Boolean( pattern.match(/[\/\\]/) );

                        } else 
                            throw("Unsupported filemask:"+rr[i].pattern);
            }}
            rr.push("$");
            this.reFile = new RegExp( rr.join('') ,'i' ); 
        };
        
        if (this.basepath) {
            this.basepath = removeLastSepPath(this.basepath);
        }
            //this.basepath = path.dirname(path.normalize(this.basepath+"/uu"));
    } // initialize
     
}


function foreachfiles_onepath( pathmask , callback , opts ){
    let f_round;
    let resA=[]
    //console.log("foreachfilesX:" , pathmask);
    const ctx = new PathMatcher( pathmask , opts );

    let filterFolder=(ffnm)=>{ return true }
    f_filehandle= (ffnm)=>{
        if ( ctx.filter(ffnm)) {
            let relname= path.relative(ctx.basepath,ffnm)
            if (callback) 
                callback(null,ffnm,fst,relname); 
            else 
                resA.push( ctx.relname ? relname : ffnm )
        }
    }
    f_round=( crdir ) => {
        let lst = fs.readdirSync(crdir)
        for (let fnm of lst ) {
            let ffnm = crdir+"/"+fnm;
            let fst= fs.statSync( ffnm )
            if (fst.isDirectory() && ctx.recurse) {
                if (filterFolder(ffnm)) f_round(ffnm)     
            } else if (fst.isFile()) {
                f_filehandle(ffnm);
            }
            // r.isSymbolicLink ? "l" : "other"
        }    
    }   
    fst = fileStat( ctx.basepath );
    if (!fst) return undefined; // TODO: need return error! 
    else if (fst.typefile=="f") f_filehandle(ctx.basepath)
    else if (fst.typefile=="d") f_round(ctx.basepath );
    else return undefined
    return resA;
}



//----------- tests -------------
async function testreaddir(){
    let netp='\\\\10.1.0.94\\c$\\opt/stelcs/PO-Int/static';
    //let pm = new PathMatcher("d:\\temp/**\\*.(pcm|txt)");
    //console.log( fs.readdirSync("d:/temp/")  ) 
    //fs.statSync( "yyyy" )
    //console.log( await foreachfilesX( netp  , undefined , {relname:1} ) ) 
    //console.log(  foreachfilesX( "d:\\temp/*.pcm"  , undefined , {relname:1} ) ) 
    //console.log(  foreachfilesX( "d:\\temp/*.(pcm|txt)"  , undefined , {relname:1} ) ) 
    //console.log(  foreachfiles_onepath( "d:/temp/2t/**.+(txt1|txt2)"  , undefined , {relname:1} ) ) 
    console.log(  foreachfiles_onepath( "d:/temp/2t/+(u/|)*.txt1"  , undefined , {relname:0} ) ) 
    //console.log( fs.readdirSync(netp)  )   
    //console.log( await fileStat(netp) )
}

async function main_test() {
    jsfile = __filename;
    if (path.basename(process.argv[1]) != path.basename(jsfile)) return;
    
    prnftime= (f)=>console.log("==",f, fs.statSync(f).mtime.getTime()); 
    console.log( os.tmpdir() )
    //await testreaddir();  console.log( "end work test" );  return;
   //console.log( module.exports ); return
   //await foreachfiles(["src/**/*.ts","src/**/*.tsx",], prnftime )
   //await foreachfiles(['\\\\192.168.77.66/c$/opt/stelcs/PO-Int/bin/*'], prnftime )
   //await foreachfiles(['\\\\192.168.77.66/c$/opt/stelcs/PO-Int/bin/*'], prnftime )
   //await foreachfiles(['\\\\localhost\\dtemp\\ard'], prnftime )
   //await foreachfiles(['\\\\10.1.0.94/c$/opt/stelcs/PO-Int/mediaserver/**.js'], prnftime )
   //await foreachfiles(['\\\\10.1.0.94/c$/opt/stelcs/PO-Int/mediaserver/+(lib/*.js)'], prnftime )
   //await foreachfiles(['d:/temp/2t/+(u/|)*.txt1'], prnftime )
   //await foreachfiles(['d:/temp/2t/*.txt@(1|2)'], prnftime )
   
   console.log( foreachfiles_onepath( "D:/work/General/node/pont-test/temp/dist/index.js"  , undefined , {relname:0} )) 
   
   console.log( "end work test" );  return;
   
   //console.log( "getFilesMaxTime" , await getFilesMaxTime("src/**/*.ts") )
   let dst_temp=process.env.temp+"/test.b-t"
   console.log(`test.copy files: src/**/*.ts => ${dst_temp}`);
   //await copyFiles("src/**/*.ts", dst_temp , (sfn,dfn)=>console.log(`copy ${sfn} -> ${dfn}`) )
   console.log( await copyFiles("src/**/*.ts", dst_temp , { display:true }  ) )
   console.log( await copyFiles("src/**/*.ts", dst_temp , { display:false , changed:true }  ) )
   console.log( await copyFiles("src/**/*.ts", dst_temp , { display:false  }  ) )
   console.log(`test.rmdir ${dst_temp}`);
   fs.rmdirSync(dst_temp,{ recursive:true });
   console.log("end test")
   return true;
}

main_test();

// run test:
// node --eval="require('./build/build-tool.js').test()"