class HoboMigration45 < ActiveRecord::Migration
  def self.up
    add_column :conferences, :endTime, :datetime
  end

  def self.down
    remove_column :conferences, :endTime
  end
end
