After a user/peer turn-finished:
1. POST /v1/default/banks/<memoryBankId>/memories { items: [{ content: turnText(finishedTurn) }] }
   (on 404: PUT /v1/default/banks/<memoryBankId> {} then retry retain once — or skip PUT if M1 probe shows auto-create)
2. POST .../memories/recall { query: "durable facts worth recalling later", max_tokens: 4000 }
3. Rewrite MEMORY.md as bullets from results[].text (cap ~16000 chars).
4. Do not write memory/YYYY-MM-DD.md from this step.
On any failure or 120s timeout: log [memory] agent=<id> failed; leave MEMORY.md untouched.
TurnSource stays 'memory-writer' (hidden; cost still counts).
