import { Box, Button, MenuItem, TextField } from '@mui/material';
import { Clear, Print } from '@mui/icons-material';

export default function ListToolbar({
  search,
  onSearch,
  searchLabel = 'Search',
  sort,
  onSort,
  sortOptions = [],
  filter,
  onFilter,
  filterLabel = 'Filter',
  filterOptions = [],
  onPrint,
}) {
  const hasControls = search !== undefined || sortOptions.length > 0 || filterOptions.length > 0;
  if (!hasControls) return null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
      {onSearch && (
        <TextField
          size="small"
          label={searchLabel}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          sx={{ minWidth: { xs: '100%', sm: 220 } }}
        />
      )}
      {onFilter && filterOptions.length > 0 && (
        <TextField
          select
          size="small"
          label={filterLabel}
          value={filter}
          onChange={(event) => onFilter(event.target.value)}
          sx={{ minWidth: 150 }}
        >
          {filterOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
      )}
      {onSort && sortOptions.length > 0 && (
        <TextField
          select
          size="small"
          label="Sort by"
          value={sort}
          onChange={(event) => onSort(event.target.value)}
          sx={{ minWidth: 170 }}
        >
          {sortOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </TextField>
      )}
      <Button
        size="small"
        startIcon={<Clear />}
        variant="text"
        onClick={() => {
          onSearch?.('');
          onFilter?.('');
          onSort?.(sortOptions[0]?.value || '');
        }}
        disabled={!search && !filter && (!sortOptions.length || sort === sortOptions[0]?.value)}
      >
        Clear
      </Button>
      {onPrint && <Button className="print-hide" size="small" startIcon={<Print />} variant="outlined" onClick={onPrint}>Print table</Button>}
    </Box>
  );
}
