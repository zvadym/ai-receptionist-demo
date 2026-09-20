// The Live API forwards Responses events in response.event envelopes.
// Collect function items, not response.completed.output (which can be empty).
export type WireEvent = Record<string, unknown> & { type: string };
type Call = { call_id: string; name: string; arguments: string };
type Pending = { calls: Map<string, Call>; completed: boolean };

export class LiveToolRouter {
  private responses = new Map<string, Pending>();
  private delegations = new Map<string, string>();
  private preparedDelegations = new Set<string>();
  constructor(private send: (event: WireEvent) => void, private execute: (call: Call) => string) {}
  receive(envelope: WireEvent) {
    if (envelope.type !== 'response.event') return;
    const event = envelope.event as Record<string, any> | undefined;
    if (!event) return;
    const delegation = String(envelope.delegation_id || '');
    if (event.type === 'response.created') {
      const id = event.response?.id;
      if (typeof id !== 'string') return;
      this.delegations.set(delegation, id);
      if (!this.responses.has(id)) this.responses.set(id, { calls: new Map(), completed: false });
      return;
    }
    const id = event.response_id || event.response?.id || this.delegations.get(delegation);
    const pending = this.responses.get(id);
    if (!pending || pending.completed) return;
    if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
      const call = event.item;
      if ([call.call_id, call.name, call.arguments].every(v => typeof v === 'string')) pending.calls.set(call.call_id, call);
    }
    if (event.type === 'response.failed' || event.type === 'response.cancelled' || event.type === 'response.incomplete') pending.completed = true;
    if (event.type === 'response.completed') {
      pending.completed = true;
      if (!pending.calls.size) return;
      const prepares = [...pending.calls.values()].some(c => c.name.startsWith('prepare_'));
      if (prepares) this.preparedDelegations.add(delegation);
      for (const call of pending.calls.values()) {
        const output = this.preparedDelegations.has(delegation) && call.name === 'confirm_booking_change'
          ? JSON.stringify({ ok: false, error: 'Separate user confirmation required after proposal.' })
          : this.execute(call);
        this.send({ type: 'response.item.create', item: { type: 'function_call_output', call_id: call.call_id, output } });
      }
      this.send({ type: 'response.create' });
    }
  }
}
