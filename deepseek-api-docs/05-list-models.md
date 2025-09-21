# Lists Models

```
GET https://api.deepseek.com/models
```

Lists the currently available models, and provides basic information about each one such as the owner and availability. Check [Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing) for our currently supported models.

## Response

### 200 OK

Returns A list of models

**object** string (required)
- Possible values: [ `list`]

**data** Model[] (required)

Array:

**id** string (required)
- The model identifier, which can be referenced in the API endpoints.

**object** string (required)
- Possible values: [ `model`]
- The object type, which is always "model".

**owned_by** string (required)
- The organization that owns the model.

## Example Request

```bash
curl -L -X GET 'https://api.deepseek.com/models' \
-H 'Accept: application/json' \
-H 'Authorization: Bearer <TOKEN>'
```