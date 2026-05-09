package variable

import (
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/vyftlabs/vyft/apps/backend/internal/openapi"
	"github.com/vyftlabs/vyft/apps/backend/internal/db/sqlc"
)

func variableToWire(v sqlc.Variable, usedBy []openapi.ResourceRef) openapi.Variable {
	secret := v.Secret != nil && *v.Secret
	var val *string
	if !secret {
		val = v.Value
	}
	var resourceID *openapi_types.UUID
	if v.ResourceID.Valid {
		id := openapi_types.UUID(uuid.UUID(v.ResourceID.Bytes))
		resourceID = &id
	}
	out := openapi.Variable{
		Id:         openapi_types.UUID(uuid.UUID(v.ID.Bytes)),
		ProjectId:  openapi_types.UUID(uuid.UUID(v.ProjectID.Bytes)),
		ResourceId: resourceID,
		Key:        v.Key,
		Value:      val,
		Secret:     secret,
		CreatedAt:  v.Created.Time,
		UpdatedAt:  v.Updated.Time,
	}
	if len(usedBy) > 0 {
		out.UsedBy = &usedBy
	}
	return out
}

func ownedToWire(v sqlc.Variable) openapi.OwnedResourceVariable {
	secret := v.Secret != nil && *v.Secret
	var val *string
	if !secret {
		val = v.Value
	}
	return openapi.OwnedResourceVariable{
		Kind:       openapi.OwnedResourceVariableKindOwned,
		Id:         openapi_types.UUID(uuid.UUID(v.ID.Bytes)),
		ProjectId:  openapi_types.UUID(uuid.UUID(v.ProjectID.Bytes)),
		ResourceId: openapi_types.UUID(uuid.UUID(v.ResourceID.Bytes)),
		Key:        v.Key,
		Value:      val,
		Secret:     secret,
		CreatedAt:  v.Created.Time,
		UpdatedAt:  v.Updated.Time,
	}
}

func importedToWire(rv sqlc.ResourceVariable, source *openapi.ImportSource) openapi.ImportedResourceVariable {
	return openapi.ImportedResourceVariable{
		Kind:             openapi.ImportedResourceVariableKindImported,
		ProjectId:        openapi_types.UUID(uuid.UUID(rv.ProjectID.Bytes)),
		ResourceId:       openapi_types.UUID(uuid.UUID(rv.ResourceID.Bytes)),
		Key:              rv.Key,
		SourceVariableId: openapi_types.UUID(uuid.UUID(rv.VariableID.Bytes)),
		Source:           source,
		CreatedAt:        rv.Created.Time,
		UpdatedAt:        rv.Created.Time,
	}
}

func importedSourceWire(src sqlc.Variable) *openapi.ImportSource {
	return &openapi.ImportSource{
		Id:     openapi_types.UUID(uuid.UUID(src.ID.Bytes)),
		Key:    src.Key,
		Secret: src.Secret != nil && *src.Secret,
	}
}

func importedSourceResourceWire(res sqlc.Resource) *openapi.ResourceRef {
	return &openapi.ResourceRef{
		Id:   openapi_types.UUID(uuid.UUID(res.ID.Bytes)),
		Name: res.Name,
	}
}

func resourceRefUsedBy(res sqlc.Resource) openapi.ResourceRef {
	return openapi.ResourceRef{
		Id:   openapi_types.UUID(uuid.UUID(res.ID.Bytes)),
		Name: res.Name,
	}
}

func wrapOwned(v openapi.OwnedResourceVariable) (openapi.ResourceVariable, error) {
	var rv openapi.ResourceVariable
	if err := rv.FromOwnedResourceVariable(v); err != nil {
		return openapi.ResourceVariable{}, err
	}
	return rv, nil
}

func wrapImported(v openapi.ImportedResourceVariable) (openapi.ResourceVariable, error) {
	var rv openapi.ResourceVariable
	if err := rv.FromImportedResourceVariable(v); err != nil {
		return openapi.ResourceVariable{}, err
	}
	return rv, nil
}
