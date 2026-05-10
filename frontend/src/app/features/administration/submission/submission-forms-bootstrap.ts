/**
 * Imports side-effect que disparan el registerSubmissionForm() de cada
 * formulario al cargar la ruta de submission. Vive aparte del submission-page
 * para que los specs unit del page no hereden las dependencias HTTP de los
 * formularios reales (FileUploadModule, SubmissionFacade, etc.).
 *
 * El loadComponent de la ruta `programas/:uuid/cargar` lo importa primero,
 * garantizando que el registry quede poblado antes de que el host intente
 * montar el componente correspondiente al entity-type de la colección.
 */
import './forms/document-submission-form/document-submission-form';
import './forms/gallery-submission-form/gallery-submission-form';
import './forms/stats-submission-form/stats-submission-form';
