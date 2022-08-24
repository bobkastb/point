Param ( $pProjectName ,[Alias("s")]$pRemoteServer  )
$bp = $MyInvocation.BoundParameters
. bld.ps1 @args -pCmd build -pBuildOnly @bp