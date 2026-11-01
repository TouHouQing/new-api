"""Expose loopback model adapters only to this WSL host, never the LAN."""
import argparse
import ipaddress
import selectors
import socket
import socketserver
import threading


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bind', required=True)
    parser.add_argument('--allow', required=True)
    parser.add_argument('--mapping', action='append', default=[], help='Private relay port:loopback adapter port')
    args = parser.parse_args()
    network = ipaddress.ip_network(args.allow, strict=False)
    address = ipaddress.ip_address(args.bind)
    if not address.is_private or address not in network:
        raise ValueError('Relay must bind the private WSL adapter')

    class Relay(socketserver.BaseRequestHandler):
        def handle(self):
            if ipaddress.ip_address(self.client_address[0]) not in network:
                return
            with socket.create_connection(('127.0.0.1', self.server.target), timeout=30) as upstream:
                selector = selectors.DefaultSelector()
                with selector:
                    for incoming, outgoing in [(self.request, upstream), (upstream, self.request)]:
                        incoming.settimeout(1800)
                        selector.register(incoming, selectors.EVENT_READ, outgoing)
                    while True:
                        ready = selector.select(timeout=1800)
                        if not ready:
                            return
                        for key, _ in ready:
                            data = key.fileobj.recv(65536)
                            if not data:
                                return
                            key.data.sendall(data)

    class Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True
        request_queue_size = 128

    servers = []
    mappings = []
    for value in args.mapping:
        port, target = map(int, value.split(':'))
        if not 1024 <= port <= 65535 or not 1024 <= target <= 65535 or port == target:
            raise ValueError('Relay mapping must use distinct unprivileged ports')
        mappings.append((port, target))
    for port, target in mappings or [(13013, 13003), (13014, 13004)]:
        server = Server((str(address), port), Relay)
        server.target = target
        servers.append(server)
        threading.Thread(target=server.serve_forever, daemon=True).start()
    threading.Event().wait()


if __name__ == '__main__':
    main()
