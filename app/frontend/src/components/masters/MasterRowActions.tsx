type Props = {
  onSave: () => void | Promise<boolean | void>;
  onDelete?: () => void | Promise<boolean | void>;
  deleteDisabled?: boolean;
};

/** マスタ行の保存・削除ボタン */
export function MasterRowActions({ onSave, onDelete, deleteDisabled }: Props) {
  return (
    <td style={{ whiteSpace: 'nowrap' }}>
      <button type="button" className="mbtn save" onClick={() => void onSave()}>
        保存
      </button>{' '}
      {onDelete && (
        <button type="button" className="mbtn del" disabled={deleteDisabled} onClick={() => void onDelete()}>
          削除
        </button>
      )}
    </td>
  );
}
