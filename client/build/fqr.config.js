

//const btool = require("../../build/build-tool");
const btool = require("../../build/build-tool");
const bapi = require("../../build/build_app");
const path = require("path");

const fs = require("fs");



const  _builtPath = "site/built"

const cfg={
    builtPath : _builtPath,
    lessMainSource : "src/less/style.less",
    lessAllSource : "src/less/*.less",
    // lessDest : `${_builtPath}/css/style.css`,
    indexSrc : "src/index.tsx",
    indexDst : `${_builtPath}/js/index.js`,
    toClean : ["bin", _builtPath],
    themes : ["dark", "sky"],
}    

const
    rollupIndexCfg = {
        input: cfg.indexSrc,
        output: {
            file: cfg.indexDst,
            format: "umd",
            sourcemap: true,
        },
        plugins: btool.prep_rollupPlugins( {tsconfig: "./tsconfig.json"} ),
    }


//module.exports = { build, start, clean, wipe };
function tprint(...v){
    console.log(...v)
}
async function rebuild(  ) {
    return await doBuild(true)
}
async function build(  ) {
    return await doBuild(false)
}
async function doBuild( rebuild ) {
    let ctx = bapi.loadCtx();

    console.log(`Build ${rebuild?"<rebuild>" :""}  npm bin: ${ ctx.npmBuildDir } params:${ bapi.PrintParams(ctx)}` )
    const rewriteURLs='all'
    const temp_css = 'src/less/const.less'
    let changes=0; let errs=0;
    if (rebuild || await btool.checkchangeInput(cfg.lessAllSource, `${cfg.builtPath}/css/*.css` )) 
        for (let themeID of cfg.themes) { 
            let dest_css = `${cfg.builtPath}/css/theme-${themeID}.css`;
            
            fs.copyFileSync( `src/less/theme-${themeID}.less`, temp_css );
            let err=await btool.cmd(`lessc --rewrite-urls=${rewriteURLs} ${cfg.lessMainSource} ${dest_css}` ,{ log:true} )
            fs.unlinkSync(temp_css)
            errs += err?1:0; changes++;    
        }    

    //if (rebuild || await btool.checkchangeInput(["src/**/*.ts", "src/**/*.tsx","tsconfig.json"], cfg.indexDst)) {
    if (rebuild || await btool.checkchangeInput([ ...ctx.prjCfg.include ,"tsconfig.json"], cfg.indexDst)) {    
        console.log(`Build:roolup! => ${cfg.indexDst} cache to ${process.env.CACHE_DIR}`)
        let err = await btool.do_rollup( rollupIndexCfg )
        changes++;  errs += err?1:0;

    }
    
    
    if (true) {
    //if (errs==0 && changes>0) {
        console.log("Build:copy site files to ctx.assembly_dir!")
        let cr= await btool.copyFiles("site/**" , ctx.assembly_dir , { changed:true , display:false } )
        //console.log("Copy result: ",cr)
    }    

    await copy2remote(ctx)

}
async function copy2remote( ctx ){
    //console.log("---",ctx)
    if (!ctx || !ctx.prjCfg ) ctx = bapi.loadCtx();
    //console.log(ctx)
    await bapi.copy2remote( ctx , ctx.assembly_dir+`/**`, ctx.prjCfg.aBuildDirs.assembly_remotedir )

}

module.exports = { build, rebuild , copy2remote, options:()=>tprint(rollupIndexCfg), 
        start:()=>tprint("e-start"), clean:()=>tprint("e-clean"), wipe:()=>tprint("e-wipe") };
//module.exports = { build:()=>{tprint("build")}, start:()=>tprint("build"), clean:()=>tprint("build"), wipe:()=>tprint("build") };


function main_test(){
    jsfile = __filename;
    if (path.basename(process.argv[1]) != path.basename(jsfile)) return;
    // debug run!
    console.log( "cwd:" , process.cwd() ," | " , process.argv.join(" ")  )
    process.chdir(path.normalize(jsfile+"/../.."))
    console.log( "cwd:" , process.cwd() )
    doBuild(false)
    //copy2remote()
}
main_test();