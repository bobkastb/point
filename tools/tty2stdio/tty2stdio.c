/* ########################################################################

   tty0tty - linux null modem emulator 

   ########################################################################

   Copyright (c) : 2013  Luis Claudio Gambôa Lopes and Maximiliano Pin max.pin@bitroit.com

   This program is free software; you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation; either version 2, or (at your option)
   any later version.

   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.

   You should have received a copy of the GNU General Public License
   along with this program; if not, write to the Free Software
   Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.

   For e-mail suggestions :  lcgamboa@yahoo.com
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

static char buffer[1024];

int
ptym_open(char *pts_name, char *pts_name_s , int pts_namesz)
{
    char    *ptr;
    int     fdm;

    strncpy(pts_name, "/dev/ptmx", pts_namesz);
    pts_name[pts_namesz - 1] = '\0';

    fdm = posix_openpt(O_RDWR | O_NONBLOCK | O_NOCTTY);
    if (fdm < 0)
        return(-1);
    if (grantpt(fdm) < 0) 
    {
        close(fdm);
        return(-2);
    }
    if (unlockpt(fdm) < 0) 
    {
        close(fdm);
        return(-3);
    }
    if ((ptr = ptsname(fdm)) == NULL) 
    {
        close(fdm);
        return(-4);
    }
    
    strncpy(pts_name_s, ptr, pts_namesz);
    pts_name[pts_namesz - 1] = '\0';

    return(fdm);        
}


int
conf_ser(int serialDev)
{

int rc;
struct termios params;

// Get terminal atributes
rc = tcgetattr(serialDev, &params);

// Modify terminal attributes
cfmakeraw(&params);

rc = cfsetispeed(&params, B9600);

rc = cfsetospeed(&params, B9600);

// CREAD - Enable port to read data
// CLOCAL - Ignore modem control lines
params.c_cflag |= (B9600 |CS8 | CLOCAL | CREAD);

// Make Read Blocking
//fcntl(serialDev, F_SETFL, 0);

// Set serial attributes
rc = tcsetattr(serialDev, TCSANOW, &params);

// Flush serial device of both non-transmitted
// output data and non-read input data....
tcflush(serialDev, TCIOFLUSH);


  return EXIT_SUCCESS;
}

void
copydata(int fdfrom, int fdto)
{
  ssize_t br, bw;
  char *pbuf = buffer;
  br = read(fdfrom, buffer, 1024);
  if (br < 0)
  {
    if (errno == EAGAIN || errno == EIO)
    {
      br = 0;
    }
    else
    {
      perror("read");
      exit(1);
    }
  }
  if (br > 0)
  {
    do
    {
      do
      {
        bw = write(fdto, pbuf, br);
        if (bw > 0)
        {
          pbuf += bw;
          br -= bw;
        }
      } while (br > 0 && bw > 0);
    } while (bw < 0 && errno == EAGAIN);
    if (bw <= 0)
    {
      // kernel buffer may be full, but we can recover
      fprintf(stderr, "Write error, br=%d bw=%d\n", (int) br, (int) bw);
      usleep(500000);
      // discard input
      while (read(fdfrom, buffer, 1024) > 0)
        ;
    }
  }
  else
  {
    usleep(100000);
  }
}


int make_and_link( char * vfilepath ){
  char master1[1024];
  char slave1[1024];
  int fd1;
	fd1=ptym_open(master1,slave1,1024);
	if (strlen(vfilepath)) {
		unlink(vfilepath);
		if (symlink(slave1, vfilepath) < 0) {
			fprintf(stderr, "Cannot create: %s\n", vfilepath);
			exit(1);
		}	
	} else {
	  strcpy(vfilepath,slave1);
	}
	conf_ser(fd1);
	return fd1;
}


int runchild( int out_strm , int in_strm , const char * child_cmd ){
    if (dup2(out_strm, STDOUT_FILENO) < 0) {
	  fprintf(stderr,"dup2 (stdout)"); exit(1);}	
    if (dup2(in_strm, STDIN_FILENO) < 0) {
	  fprintf(stderr,"dup2 (stdin)"); exit(1);}	
	int r= execlp("nodejs", "nodejs", child_cmd, NULL);	
	fprintf(stderr,"exec error, returned %d\n", r); 
	exit(0);	
}

int runchildauto( char* strm_fname , const char * child_cmd ){
	while(1){
		int fd_strm = make_and_link(strm_fname); 
		int cpid = fork();
		if (cpid == -1) { perror("fork");exit(EXIT_FAILURE);}
		if (cpid == 0) {    // Child reads from pipe 
			runchild(fd_strm , fd_strm , child_cmd);
		} 
		wait(NULL);
	}	
}
int redirectfiles( int childOut , int childIn , int fd_strm ){
  fd_set rfds;
  int retval;
  int sel=childOut; if (sel<fd_strm) sel=fd_strm;
  while(1)  {
    FD_ZERO(&rfds);FD_SET(childOut, &rfds);FD_SET(fd_strm, &rfds);

    retval = select(sel + 1, &rfds, NULL, NULL, NULL);
    if (retval == -1){ perror("select");return 1;}
    if (FD_ISSET(childOut, &rfds))
      copydata(childOut, fd_strm );
    if (FD_ISSET(fd_strm, &rfds))
      copydata(fd_strm, childIn);
  }
	return 0;
}
int runchildpipe( int fd_strm , const char * child_cmd ){
    int pipeTo[2];int pipeFrom[2];
    if (pipe(pipeTo) == -1) { perror("pipe");exit(EXIT_FAILURE); }
    if (pipe(pipeFrom) == -1) { perror("pipe");exit(EXIT_FAILURE); }
    int cpid = fork();
    if (cpid == -1) { perror("fork");exit(EXIT_FAILURE);}
    if (cpid == 0) {    // Child reads from pipe 
		close( pipeFrom[0] );
		close( pipeTo[1] );
		runchild( pipeFrom[1],pipeTo[0], child_cmd  );
    } else { 
		close( pipeFrom[1] );
		close( pipeTo[0] );
		redirectfiles( pipeFrom[0] , pipeTo[1] , fd_strm );
        //wait(NULL);                /* Wait for child */
        exit(EXIT_SUCCESS);
    }
}
void printbin(FILE* f,const char * b , int cnt){
	for (int i=0;i<cnt;i++) 
		fprintf( f , " %2x", b[i] );
}
int runtest( int fd_strm ){
	char buffer[10*1024];
	
	while (1) {
	int br = read(fd_strm, buffer, 1024);
	if (br < 0) {
		if (errno == EAGAIN || errno == EIO) br = 0;
		else { perror("read");exit(1); }
	}		
	if (br == 0) { usleep(50*1000); continue; }
	buffer[br]=0;
	write(fd_strm, buffer, br);
	//printf("<<:%s", buffer );
	printf("<<:");
	printbin( stdout , buffer , br );
	printf("\n");
	
	}	
}	

int main(int argc, char* argv[])
{

  int fd1;
  int fd2;


  if (argc >= 3)
  {
	//fd2 = make_and_link(argv[2]); 
	//fd2 = doopen2(argv[2]);
    //printf("(%s) <=> (%s)\n",argv[1],argv[2]);
	runchildauto( argv[1] , argv[2] );
	//runchildpipe( fd1, argv[2] );
    printf("(%s) <=> (%s)\n",argv[1],argv[2]);
  } else if (argc == 2) {
	fd1 = make_and_link(argv[1]); 
	runtest(fd1);
	exit(0);
	  
  } else {
	char nm1[1024] , nm2[1024]; nm1[0]=0; nm2[0]=0;
	fd1 = make_and_link(nm1); 
	fd2 = make_and_link(nm2); 
    printf("(%s) <=> (%s)\n",nm1,nm2);
  }

  fd_set rfds;
  int retval;


  while(1)
  {
    FD_ZERO(&rfds);
    FD_SET(fd1, &rfds);
    FD_SET(fd2, &rfds);

    retval = select(fd2 + 1, &rfds, NULL, NULL, NULL);
    if (retval == -1)
    {
      perror("select");
      return 1;
    }
    if (FD_ISSET(fd1, &rfds))
    {
      copydata(fd1, fd2);
    }
    if (FD_ISSET(fd2, &rfds))
    {
      copydata(fd2, fd1);
    }
  }

  close(fd1);
  close(fd2);

  return EXIT_SUCCESS;
}

// ./tty2stdio redir1 switch.server.js