# Complaints and account-deletion requests

This is a written procedure for a person. It is not a ticketing system. Nothing in the app emails staff when someone complains, and nothing in the app shows a chat to staff.

Mailbox: **admin@bridge-bite-co.com**. Do not invent another address.

## Chat retention

Chats are kept until the person deletes that chat or deletes the account. A free account can open the latest chat; older chats stay stored. There is no automatic expiry. A future maximum (for example 24 months) is **not in place**. There is no job that deletes chats by age. See [data-retention.md](data-retention.md).

## Complaints

1. Read the email at admin@bridge-bite-co.com.
2. Aim to acknowledge it within 2 business days. Aim to resolve it within 10 business days. Those are targets, not a guarantee, and the public pages say so.
3. Reply from that same mailbox. Say what you will do, or what you cannot do.
4. Do not promise a clinician review, a human watching chats, or a refund the Australian Consumer Law does not require. A period already charged is not partly refunded except where that law requires it.
5. Keep the email. There is no complaint record inside the app.

## Account deletion by email

Use this when the person cannot use My Account → Delete account.

1. The request must come from the account’s sign-in email, to admin@bridge-bite-co.com, and it must ask for the account to be deleted.
2. If the address does not match an account, reply and say no matching account was found. Do not delete a different account.
3. Sign in is not done by this document. A person with access to the server data deletes that account the same way the app does:
   - cancel a current Stripe subscription immediately (Stripe Dashboard, or the same `DELETE /subscriptions/{id}` the app uses)
   - remove that account’s row from the account file
   - remove that account’s chats
   - remove that account’s check-ins and weekly goals
4. Reply to the person and say what was deleted and what remains.
   - Deleted: the server account (email, name, phone, password), server chats, and server check-ins and weekly goals. A current subscription is cancelled.
   - Remains: anything still in their browser until they clear it in Settings; Stripe invoices; a host disk snapshot if one already exists. A snapshot is not confirmed for this service. Do not say it was wiped.
5. Do not delete the Stripe Customer object unless a later decision says to. Do not store or ask for the card number.

In-app deletion already does the server part when the person types DELETE. This email path is only for people who cannot do that.
