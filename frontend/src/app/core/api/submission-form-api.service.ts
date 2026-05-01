import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SubmissionForm, SubmissionFormField } from './models/submission-form.model';
import { DSPACE_API_BASE, SUBMISSIONFORMS_PATH } from './dspace-rest.util';

/**
 * Shape literal que devuelve DSpace 9.x para `/api/config/submissionforms/{name}`.
 * Capturado el 30/04/2026 contra la instancia DIGEEX. Fixtures en
 * `test-fixtures/submissionforms-digeex-*.json`.
 */
interface SubmissionFormResponse {
  id: string;
  name: string;
  rows: SubmissionFormResponseRow[];
}

interface SubmissionFormResponseRow {
  fields: SubmissionFormResponseField[];
}

interface SubmissionFormResponseField {
  input: { type: string };
  label: string;
  mandatory: boolean;
  repeatable: boolean;
  hints?: string;
  mandatoryMessage?: string;
  selectableMetadata: SubmissionFormResponseSelectableMetadata[];
}

interface SubmissionFormResponseSelectableMetadata {
  metadata: string;
  label: string | null;
  closed: boolean;
  controlledVocabulary?: string;
}

/**
 * Aplana el shape de DSpace a `SubmissionForm`. Usa el primer entry de
 * `selectableMetadata[]` para `metadata` y `vocabularyName`. DIGEEX solo
 * declara un selectableMetadata por field; si un form stock futuro declara
 * varios, este mapper se extiende.
 */
function mapResponseToSubmissionForm(response: SubmissionFormResponse): SubmissionForm {
  const fields: SubmissionFormField[] = [];
  for (const row of response.rows) {
    for (const field of row.fields) {
      const meta = field.selectableMetadata[0];
      fields.push({
        metadata: meta.metadata,
        label: field.label,
        inputType: field.input.type,
        mandatory: field.mandatory,
        repeatable: field.repeatable,
        hints: field.hints,
        mandatoryMessage: field.mandatoryMessage,
        vocabularyName: meta.controlledVocabulary,
      });
    }
  }
  return { id: response.id, name: response.name, fields };
}

/** Wrapper HTTP del recurso `/api/config/submissionforms` de DSpace. Solo habla con el backend, sin reglas de negocio. */
@Injectable({ providedIn: 'root' })
export class SubmissionFormApiService {
  private readonly http = inject(HttpClient);

  /**
   * Pide al backend la definición del formulario identificado por `name`
   * (`digeex-galeria`, `digeex-documento`, `digeex-estadistica` o cualquier
   * stock de DSpace). Aplana el shape de DSpace al modelo plano que consume
   * el frontend.
   */
  getForm(name: string): Observable<SubmissionForm> {
    return this.http
      .get<SubmissionFormResponse>(`${DSPACE_API_BASE}${SUBMISSIONFORMS_PATH}${name}`)
      .pipe(map((response) => mapResponseToSubmissionForm(response)));
  }
}
