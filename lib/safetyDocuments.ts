// lib/safetyDocuments.ts
import { supabase } from './supabase';

export async function getSafetyDocuments() {
  const { data, error } = await supabase
    .from('safety_documents')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data;
}

export async function acknowledgeSafetyDocument(userId: string, documentId: string) {
  const { error } = await supabase
    .from('safety_document_acknowledgements')
    .upsert(
      [{ user_id: userId, document_id: documentId }],
      { onConflict: 'user_id,document_id' }
    );

  if (error) throw error;
}