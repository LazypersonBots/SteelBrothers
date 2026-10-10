import { createSteelBrothersServer } from './server/render-app.mjs';

const port = Number(process.env.PORT || 10000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = createSteelBrothersServer();
server.listen(port, '0.0.0.0', () => {
  console.log('Steel Brothers running on 0.0.0.0:' + port);
});
