# Write-up: improvements and known limitations

## What I would improve with another week

1. **Finish the server hardening.** SSH is key-only, password login is off, fail2ban is running and the OS is updated (done 19 October 2026). Next I would add a non-root admin user, automatic security updates and a tested restore from backup.
2. **Fix the near-duplicate package pages.** The adenocarcinoma, adrenal and anal packages share almost the same text, so a general question can show any of them as the source. I would add a package-level fact table to the knowledge base and make the bot ask which cancer type when the question names none.
3. **Make state survive a restart.** Rate-limit counters and conversation history live in server memory. Moving them to the database (or Redis) removes the reset on restart and allows more than one server.
4. **Send leads to a person.** Contact-card leads are stored, but nobody is told. An email or Slack message per lead, plus a daily digest, would close that loop.
5. **Native-speaker review and a translated page.** The Turkish, Spanish and Arabic fixed texts were written with AI help and not reviewed. The web page labels (buttons, welcome cards) are English only.
6. **Heavier testing.** A load test with many parallel chats, a test of `ingest:refresh --apply` against the live project, a restore test from backup, and a human read of a larger answer sample, since automatic checks cannot judge tone.
7. **Monitoring.** An uptime check, an alert on error rate and on the daily token budget, and a weekly look at the unanswered-question log to find gaps in the content.

## Known limitations

- **Single server, no redundancy or monitoring.** Visitors behind one office or phone network share a rate limit.
- **Answer quality varies between runs.** The model has no fixed temperature. Long answers and a price named twice show up as soft flags that move between runs. Questions that make the model reason at length can take 6 to 9 seconds.
- **Crisis handling is keyword-based** for five languages. Other languages rely on the rewrite step. The bot says it is an AI assistant and is not a crisis service.
- **The medical reply can still mention the free quote** while its button is hidden.
- **Content is a snapshot.** Page text is exported by a person and loaded with the ingest scripts. Prices and terms are only as current as the last refresh.
- **Not tested yet:** heavy load, `ingest:refresh --apply` on the live project, restore from backup, and a seven-day uptime record.

Details, severity and context are in the "Known limitations" section of `README.md`.
