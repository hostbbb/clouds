class MediaFilesController < ApplicationController

  hobo_model_controller

  auto_actions :all

  skip_before_filter :verify_authenticity_token, :only => [:upload]  # TODO ... for uploading files from other domains

  def index
    # my media files only
    @media_files = current_user.media_files
  end

  def aca
    org = request.env['HTTP_ORIGIN']
    if org.length>0
      headers['Access-Control-Allow-Origin'] = org
#      headers['Access-Control-Allow-Headers'] = request.env['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']
      headers['Access-Control-Allow-Credentials'] = 'true'
    end
  end

  def options
    aca()
    # commented out lines are for reference
    #headers['Access-Control-Allow-Methods'] = 'POST, GET, OPTIONS'
    #headers['Access-Control-Allow-Methods'] = request.env['HTTP_ACCESS_CONTROL_REQUEST_METHOD']
    headers['Access-Control-Allow-Methods'] = 'POST, GET, PUT, DELETE, OPTIONS'
    headers['Access-Control-Allow-Headers'] = request.env['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']
    #headers['Access-Control-Max-Age'] = '1000'
    head :ok
  end

  # for blueimp uploader
  def upload
    upload = MediaFile.new(params[:media_file]);
#p upload.inspect
    if upload.save();
        aca()
        render :json => [{
            :tmp_name => upload.url,
            :name => upload.name,
            :size => upload.size,
            :type => upload.content_type,
            :delete_url => "/plugin/0/media_files/#{upload.id}.js",
            :delete_type => 'DELETE',
#            }], :status => 201
            }], :status => 200
    else
        render :json => [{:error => "error"}], :status => 500
    end
  end

  # overriding this for all methods, as hobo_destroy gives (empty?) response
  # that doesn't work for blue imp
  # note verified this correctly gives an error where it should
  def destroy_response(options={}, &b)
    aca()
    response_block(&b) or
    respond_to do |wants|
      wants.html { redirect_after_submit(this, true, options) }
      #wants.js   { hobo_ajax_response || render(:nothing => true) }
      wants.js   { render :json => [{:success => "OK"}], :status => 200 }
    end
  end

end
