const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const PORT = 3000;
const TEST_URL = `http://127.0.0.1:${PORT}/test/browser/index.html`;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let filePath = path.join(process.cwd(), url.pathname);

    // Safety check to prevent directory traversal
    if (!filePath.startsWith(process.cwd())) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(error.code === 'ENOENT' ? 404 : 500);
            res.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
        } else {
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                'Cross-Origin-Opener-Policy': 'same-origin',
                'Cross-Origin-Embedder-Policy': 'require-corp',
                'Cache-Control': 'no-cache'
            });
            res.end(content);
        }
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running at ${TEST_URL} with COOP/COEP headers.`);

    const pwArgs = ['test', ...process.argv.slice(2)];
    console.log(`Running Playwright: npx playwright ${pwArgs.join(' ')}`);

    const tests = spawn('npx', ['playwright', ...pwArgs], {
        stdio: 'inherit',
        env: { ...process.env }
    });

    tests.on('close', (code) => {
        console.log(`Playwright finished with code ${code}`);
        server.close(() => {
            process.exit(code);
        });
    });

    tests.on('error', (err) => {
        console.error('Failed to start Playwright:', err);
        server.close(() => {
            process.exit(1);
        });
    });
});
