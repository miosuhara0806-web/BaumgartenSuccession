import { cp, mkdir } from 'node:fs/promises';

// A static release: no compiler, dependency download, or network service required.
await mkdir('dist', { recursive:true });
await cp('index.html', 'dist/index.html');
await cp('src', 'dist/src', { recursive:true });
console.log('Static build created in dist/');
