// Placeholder socket layer — real socket.io implementation lands in a later task.
// This file exists only so services that will eventually emit real-time events
// (e.g. ConversationService) can compile and be tested before the socket.io
// layer is built. Do NOT build out real logic here; the later task should
// REPLACE this file, not merge with it.

export function emitToConversation(
  _conversationId: string,
  _event: string,
  _payload: unknown
): void {
  // Placeholder — real implementation lands in a later task (socket.io real-time layer)
}

export function emitToUser(_userId: string, _event: string, _payload: unknown): void {
  // Placeholder — real implementation lands in a later task (socket.io real-time layer)
}
