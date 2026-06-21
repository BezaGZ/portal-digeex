/**
 * Features de autorización de DSpace 9.x que el portal consulta contra
 * `/api/authz/authorizations/search/object`. El valor string es lo que viaja
 * en el query param `feature`; se copian literales del `feature-id.ts` nativo
 * de dspace-angular (no se derivan del nombre — algunos difieren).
 */
export type FeatureId =
  | 'administratorOf'
  | 'canEditItem'
  | 'canEditMetadata'
  | 'withdrawItem'
  | 'reinstateItem'
  | 'canDelete'
  | 'canManagePolicies'
  | 'canManageBitstreamBundles'
  | 'isCommunityAdmin'
  | 'isCollectionAdmin'
  | 'canSubmit'
  | 'canViewUsageStatistics';
