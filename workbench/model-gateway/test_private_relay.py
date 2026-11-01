# SPDX-License-Identifier: AGPL-3.0-or-later
import argparse
import asyncio
import unittest

from private_relay import private_address, relay


class PrivateRelayTests(unittest.IsolatedAsyncioTestCase):
    def test_only_explicit_private_interfaces_are_allowed(self):
        for address in ("0.0.0.0", "8.8.8.8", "224.0.0.1"):
            with self.assertRaises(argparse.ArgumentTypeError):
                private_address(address)
        self.assertEqual(private_address("127.0.0.1"), "127.0.0.1")

    async def test_streaming_bytes_and_disconnect_propagate_to_the_model(self):
        disconnected = asyncio.Event()

        async def model(reader, writer):
            try:
                while data := await reader.read(65536):
                    writer.write(data)
                    await writer.drain()
            finally:
                disconnected.set()
                writer.close()
                await writer.wait_closed()

        upstream = await asyncio.start_server(model, "127.0.0.1", 0)
        port = upstream.sockets[0].getsockname()[1]
        bridge = await asyncio.start_server(lambda reader, writer: relay(reader, writer, "127.0.0.1", port), "127.0.0.1", 0)
        reader, writer = await asyncio.open_connection("127.0.0.1", bridge.sockets[0].getsockname()[1])
        try:
            data = b"model-artifact" * 80000
            writer.write(data)
            await writer.drain()
            self.assertEqual(await asyncio.wait_for(reader.readexactly(len(data)), 2), data)
            writer.close()
            await writer.wait_closed()
            await asyncio.wait_for(disconnected.wait(), 2)
        finally:
            bridge.close()
            upstream.close()
            await bridge.wait_closed()
            await upstream.wait_closed()
