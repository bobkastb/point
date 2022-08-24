
CC=gcc

#FLAGS= -Wall -O2 -D_GNU_SOURCE -Wno-unused-but-set-variable
FLAGS=  -D_GNU_SOURCE -Wno-unused-but-set-variable

all:
	$(CC) $(FLAGS) tty0tty.c libvisca.c -o tty0tty

clean:
	rm -rf tty0tty *.o core
