# Get User Balance

```
GET https://api.deepseek.com/user/balance
```

Get user current balance

## Response

### 200 OK

Returns user balance info.

**is_available** boolean
- Whether the user's balance is sufficient for API calls.

**balance_infos** object[]

Array:

**currency** string
- Possible values: [ `CNY`, `USD`]
- The currency of the balance.

**total_balance** string
- The total available balance, including the granted balance and the topped-up balance.

**granted_balance** string
- The total not expired granted balance.

**topped_up_balance** string
- The total topped-up balance.

## Example Request

```bash
curl -L -X GET 'https://api.deepseek.com/user/balance' \
-H 'Accept: application/json' \
-H 'Authorization: Bearer <TOKEN>'
```