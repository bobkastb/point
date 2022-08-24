/* ########################################################################

   I2O - linux замедлитель редиректа stdin->stdout

   ########################################################################

На входе - один параметр - задержка в мс.

   ######################################################################## */


#include <sys/wait.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/select.h>
#include <errno.h>

#include <termio.h>



int copydata(int fdfrom, int fdto) {
  static char buffer[64*1024];
  ssize_t br, bw=0;
  //char *pbuf = buffer;
  //fprintf( stderr , "---------start read \n");
  br = read(fdfrom, buffer, sizeof(buffer));
  if (br < 0){
    if (errno == EAGAIN || errno == EIO)
      br = 0;
    else
    {
      perror("read");
      exit(1);
    }
  }
  //fprintf( stderr , "---------write %d bytes\n", (int)br );
  for (auto pbuf=buffer; bw<br; ) {
	auto cbr= br-bw;	
    auto bwc = write(fdto, pbuf, cbr );
	bw+=bwc;
    if (cbr!=bwc) usleep(10*1000);
  }
  //usleep(10*1000);
  //fprintf( stderr , "read-write %d bytes", (int)br );
  return br;
}

int maincopy( int delayms ){
	
	fprintf( stderr , "start , delay =%d \n", delayms );
	FILE* sIn = freopen(NULL, "rb", stdin);
	fprintf( stderr , "p1\n" );
	//FILE* sOut= freopen(NULL, "wb", stdout);
	FILE *sOut = fdopen(dup(fileno(stdout)), "wb");
	if (!sOut) fprintf( stderr , "Out stream not reopen!\n" );
	sOut=stdout;
	fprintf( stderr , "p2\n" );
	int fdIn = fileno(sIn);
	int fdOut = fileno(sOut);
	//int fdIn = fdreopen (fileno (stdin), NULL, O_RDONLY | OPEN_O_BINARY);
	
	while (1) {
		copydata( fdIn , fdOut );
		if (delayms) usleep( delayms*1000 );
	}
	return 0;
}



int main(int argc, char* argv[])
{

	int delay=0;
	if (argc>1) delay = atoi( argv[1] );
  maincopy( delay  );	
  return EXIT_SUCCESS;
}

//  g++ I2O.c -o I2O
// ./tty2stdio redir1 switch.server.js