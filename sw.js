// 旧根路径寿来 SW 的迁移版本：不拦截请求、不删除数据、不主动刷新客户端。
// 与旧应用约定相同，等待用户点击更新发送 SKIP_WAITING 后才接管。
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'SHOULAI_MIGRATION_PING') {
    event.ports[0]?.postMessage('shoulai-root-migration-v1');
  }
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
