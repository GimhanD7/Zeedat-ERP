import { useState } from 'react';
import { FileText, ReceiptText } from 'lucide-react';
import { useData } from '../../hooks/useData';
import { Button, Heading, Panel, SearchBox, Table } from '../../components/common';
import { Alert, DataView } from '../../components/feedback';
import { ref } from '../../utils';
import { saleColumns } from '../dashboard/DashboardPage';
import { ReceiptModal } from './ReceiptModal';

export function SalesHistory({ ctx }) {
  const state = useData(ctx, { sales: 'sales', settings: 'settings' });
  const [query, setQuery] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  return (
    <DataView state={state}>
      {({ sales, settings }) => (
        <>
          <Heading
            title="Sales History"
            description="Find posted invoices and reprint receipts."
          />
          <Alert>{error}</Alert>
          <Panel
            title="Posted Invoices"
            icon={FileText}
            action={
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder="Search invoice, customer or item…"
              />
            }
          >
            <Table
              rows={sales.filter(r =>
                [ref('INV', r.id), r.items, r.customer, r.branch].some(v =>
                  v?.toLowerCase().includes(query.toLowerCase())
                )
              )}
              columns={[
                ...saleColumns,
                [
                  'Receipt',
                  r => (
                    <Button
                      icon={ReceiptText}
                      disabled={loading}
                      onClick={async () => {
                        setError('');
                        setLoading(true);
                        try {
                          setReceipt(await ctx.get('invoice', { id: r.id }));
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      View
                    </Button>
                  ),
                ],
              ]}
            />
          </Panel>
          {receipt && (
            <ReceiptModal
              invoice={receipt}
              settings={settings}
              onClose={() => setReceipt(null)}
            />
          )}
        </>
      )}
    </DataView>
  );
}
