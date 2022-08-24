$SolutonDir=[IO.Path]::GetFullPath( $MyInvocation.MyCommand.Definition + "\..\.." ); 


function cmd2arr(){   return $args }

@{
    build_cmd= (cmd2arr npm run build),$null
    
    projects=@{
        server=@{
            path="$SolutonDir\server"
        }
        mediaserver=@{
            path="$SolutonDir\mediaserver"
            alias="media"
        }
        client=@{
            path="$SolutonDir\client"
        }
    }
}


