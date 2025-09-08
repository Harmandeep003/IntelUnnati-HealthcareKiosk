const { PeerServer } = require('peer');
const next = require('next');
const express = require('express');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = express();

    // ✅ Start PeerJS on same server
    const peerServer = PeerServer({ path: '/peerjs' });
    server.use('/peerjs', peerServer);

    // ✅ Handle Next.js routes
    server.all('*', (req, res) => handle(req, res));

    server.listen(3000, () => console.log('Server with PeerJS on http://localhost:3000'));
});
