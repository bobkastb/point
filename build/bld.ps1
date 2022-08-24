Param ( $pProjectName   
    ,[Alias("s")]$pRemoteServer
    ,$pCmd="build" 
    ,[switch][Alias("ncp")] $pBuildOnly
)

#$SolutonDir=[IO.Path]::GetFullPath( $MyInvocation.MyCommand.Definition + "\..\.." ); 
# key -nrc -nb
$gcfg =. build-env.ps1

function fill_paramsEnv(){
    $r = @{}
    if ($pRemoteServer) { $r.solution_remote_server=$pRemoteServer }
    if ($pBuildOnly) { $r.pe_build_Only=$pBuildOnly }
    return $r
}
$paramsEnv=fill_paramsEnv 


function onload( ){
    $list = $gcfg.projects
    $idx=@{}
    $alllst = $list.keys | %{ $list.$_ }
    foreach($pnm in  $list.keys) {
        $prj = $list.$pnm
        $prj.name = $pnm
        $prj.alias | where {$_} |  %{ $idx[$_] = $prj }
        $idx[$pnm] = $prj
    }
    $idx.all = $alllst
    $gcfg.idx = $idx;
}

function setEnvPar( $newenv ){
    $res=@{}
    $newenv.keys | where {$_} | %{ 
        $res.$_ = [Environment]::GetEnvironmentVariable( $_);
        [Environment]::SetEnvironmentVariable( $_, $newenv.$_ );
    }
    return $res
}

function struct2str($r){
    $s=($r.keys | where {$_} | %{ "$_=$($r.$_)" }) -join "; "
    return "{$s}"
}

function handler(){
    $projectlst = $gcfg.idx.$pProjectName
    if (!$projectlst) { throw "Invalid project name '$pProjectName'" }
    #if (!$pCmd) { $pCmd="build" }
    try {
        $savedEnv = setEnvPar $paramsEnv
        foreach ($prj in $projectlst) {
            $lastworkdir = Get-Location
            $null= Set-Location $prj.path
            try {
                write-host "handle project in $($prj.path) cmd:$pCmd envparams:$(struct2str $paramsEnv)" -f green
                npm run $pCmd
                if ($LastExitCode -ne 0) { break; }
            } finally {
                $null=Set-Location $lastworkdir
            }
        }
    } finally {
        
        #$savedEnv | out-host
        $null =setEnvPar $savedEnv
    }
    
}
function testagrs(){
     $args
}

#$MyInvocation.BoundParameters #UnboundArguments
#"args:$args"
#$PSBoundParameters
#"---",$MyInvocation.BoundParameters
#"---",$MyInvocation.UnboundArguments
#return

#testagrs $MyInvocation
#$PSBoundParameters
#$PSDefaultParameterValues

onload
#"test of $SolutonDir   args: $args"
#$gcfg.idx
handler
