class HoboMigration56 < ActiveRecord::Migration
  def self.up
    add_column :conferences, :actualStart, :datetime
    add_column :conferences, :actualEnd, :datetime
    add_column :conferences, :statusChanged, :datetime
  end

  def self.down
    remove_column :conferences, :actualStart
    remove_column :conferences, :actualEnd
    remove_column :conferences, :statusChanged
  end
end
