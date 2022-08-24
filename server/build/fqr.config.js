
//const { cmd } = require("faqtor");
const { cmd, seq } = require("faqtor");
const bapi = require("../../build/build_app");
const fs = require("fs");
const path = require("path");

//-------- tools --------
//-------------



const
    toClean = ["dist/index.js", "dist/lib", "dist/lib/genlib"],
    toWipe = toClean.concat(["./node_modules"]);

const
    doBuild1 = cmd(`tsc`)
        .task("building server"),
    install = seq( 
    )
    //,build = seq(doBuild, install),

        //.factor(`src/**/*.ts`, "dist/**/*.js"),
    ,clean = cmd(`rimraf ${toClean.join(" ")}`)
//    ,wipe = cmd(`rimraf ${toWipe.join(" ")}`);

function wipe(){
    console.log( "cwd:" , process.cwd() ," | " , process.argv.join(" ")  )
    console.log("-- wipe")
}

async function build( ...a  ) {
    return await bapi.BuildServer(false)
}
async function rebuild(  ) {
    return await bapi.BuildServer(true)
}

async function copy2remote(  ){
    await bapi.copy2RemoteServer();
}

async function prnenv(  ){
    await bapi.printEnvOpts()
}

function main_test(){
    jsfile = __filename;
    if (path.basename(process.argv[1]) != path.basename(jsfile)) return;
    // debug run!
    console.log( "cwd:" , process.cwd() ," | " , process.argv.join(" ")  )
    process.chdir(path.normalize(jsfile+"/../.."))
    console.log( "cwd:" , process.cwd() )
    bapi.BuildServer(false)
}


main_test()

module.exports = { build, clean, wipe , rebuild , copy2remote , prnenv };
