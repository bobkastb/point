#. bld.ps1 @args -pCmd copy2remote 
Param ( $pProjectName ,[Alias("s")]$pRemoteServer, $pCmd , [switch][Alias("ncp")] $pBuildOnly )
$bp = $MyInvocation.BoundParameters
. bld.ps1 @args -pCmd copy2remote  @bp