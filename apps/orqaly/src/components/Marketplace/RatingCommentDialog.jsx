import { useState, useEffect } from 'react';
import { Box, Rating, TextField, Typography } from '@mui/material';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import FormDialog, { FORM_FIELD_SX } from '../Common/FormDialog';

/**
 * Shared dialog for rating + commenting on a marketplace item.
 */
export default function RatingCommentDialog({
  open,
  onClose,
  itemName = '',
  currentRating = null,
  currentComment = '',
  onSave,
}) {
  const [rating, setRating] = useState(currentRating || 0);
  const [comment, setComment] = useState(currentComment || '');

  useEffect(() => {
    if (open) {
      setRating(currentRating || 0);
      setComment(currentComment || '');
    }
  }, [open, currentRating, currentComment]);

  const handleSave = () => {
    if (rating > 0) {
      onSave(rating, comment);
      onClose();
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      title={`Rate ${itemName}`}
      icon={StarRoundedIcon}
      iconVariant="warning"
      primaryLabel={currentRating ? 'Update Rating' : 'Submit Rating'}
      onPrimary={handleSave}
      primaryDisabled={rating === 0}
    >
      <Box sx={{ textAlign: 'center', py: 1 }}>
        <Rating
          value={rating}
          onChange={(_e, val) => setRating(val)}
          size="large"
          sx={{
            '& .MuiRating-iconFilled': { color: '#F59E0B' },
            '& .MuiRating-iconHover': { color: '#D97706' },
            fontSize: '2.5rem',
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {rating === 0 && 'Tap to rate'}
          {rating === 1 && 'Poor'}
          {rating === 2 && 'Fair'}
          {rating === 3 && 'Good'}
          {rating === 4 && 'Very Good'}
          {rating === 5 && 'Excellent'}
        </Typography>
      </Box>

      <TextField
        label="Comment (optional)"
        placeholder="Share your experience with this template..."
        size="small"
        multiline
        rows={3}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        sx={FORM_FIELD_SX}
      />
    </FormDialog>
  );
}
