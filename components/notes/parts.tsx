// The seller of a row, or a warning chip when no seller has the code's letters (both tables of the notes page).
export function SellerChip({ seller }: { seller: string }) {
  return seller ? <span className="chip">{seller}</span> : <span className="chip chip-warning">មិនស្គាល់</span>;
}
