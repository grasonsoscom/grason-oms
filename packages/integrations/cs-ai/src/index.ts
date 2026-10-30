// Adaptor nyata SaaS CS AI (Fase 3, keputusan 0007). Arah CS AI → OMS adalah endpoint
// kontrak di apps/api; di sini hanya arah OMS → CS AI: webhook order.status_changed.
export * from './webhook';
export * from './outbox';
