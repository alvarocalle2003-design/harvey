# Puente stdio <-> API server local de Harvey (127.0.0.1:8642). Lo usa el HUD del PC a traves de SSH.
import socket, sys, threading
s = socket.create_connection(("127.0.0.1", 8642))
def up():
    while (d := sys.stdin.buffer.read1(65536)):
        s.sendall(d)
    s.shutdown(socket.SHUT_WR)
threading.Thread(target=up, daemon=True).start()
while (d := s.recv(65536)):
    sys.stdout.buffer.write(d); sys.stdout.buffer.flush()
