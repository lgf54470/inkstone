// Public interface of the collection-page module. It stays a separate lazy chunk, loaded only when a
// visitor opens a `/c/…` address, so the editor and the share hub never travel with it.
export { CollectionPage } from './page'
